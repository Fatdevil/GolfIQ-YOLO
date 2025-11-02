import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import type { RoundSummary } from '../../../../shared/round/summary';
import type { RoundState } from '../../../../shared/round/types';
import { encodeSharedRoundV1, type SharedRoundV1 } from '../../../../shared/event/payload';
import { getItem } from '../../../../shared/core/pstore';
import { tryShareSvg } from '../lib/share';
import { render as renderShareCard, type ShareCardMeta } from '../components/summary/ShareCard';
import { eventsCloudAvailable, postSharedRound as postLiveRound } from '../cloud/eventsSync';

type RoundSummaryScreenProps = {
  summary: RoundSummary;
  meta: ShareCardMeta;
  round: RoundState;
  onDone: () => void;
};

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return value > 0 ? `+${value.toFixed(1)}` : value < 0 ? value.toFixed(1) : 'E';
}

function formatPercentage(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (!Number.isFinite(value ?? NaN)) {
    return '—';
  }
  return Number(value).toFixed(decimals);
}

function buildSharedRound(round: RoundState, summary: RoundSummary): SharedRoundV1 {
  const holeNumbers = summary.holes.map((hole) => hole.hole);
  const start = holeNumbers.length ? Math.min(...holeNumbers) : 1;
  const end = holeNumbers.length ? Math.max(...holeNumbers) : start;
  return {
    v: 1,
    roundId: round.id,
    player: {
      id: round.id,
      name: undefined,
    },
    courseId: round.courseId,
    holes: { start, end },
    gross: summary.strokes,
    sg: summary.phases.total,
    holesBreakdown: summary.holes.map((hole) => ({
      h: hole.hole,
      strokes: hole.strokes,
      net: Number.isFinite(hole.par) ? hole.strokes - Number(hole.par) : undefined,
      sg: Number.isFinite(hole.sg ?? NaN) ? Number(hole.sg) : undefined,
    })),
  };
}

export default function RoundSummaryScreen({ summary, meta, round, onDone }: RoundSummaryScreenProps): JSX.Element {
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrMessage, setQrMessage] = useState<string | null>(null);
  const [liveTarget, setLiveTarget] = useState<{ eventId: string; joinCode?: string | null } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const phaseBars = useMemo(() => {
    const rows = [
      { key: 'OTT', value: summary.phases.ott, color: '#4da3ff' },
      { key: 'APP', value: summary.phases.app, color: '#5ad07a' },
      { key: 'ARG', value: summary.phases.arg, color: '#f9a23f' },
      { key: 'PUTT', value: summary.phases.putt, color: '#ff6b8a' },
    ];
    const maxAbs = Math.max(0.1, ...rows.map((row) => Math.abs(row.value)));
    return rows.map((row) => ({
      ...row,
      ratio: Math.abs(row.value) / maxAbs,
      label: formatSigned(row.value),
    }));
  }, [summary.phases.arg, summary.phases.app, summary.phases.ott, summary.phases.putt]);

  const shareCard = useMemo(() => renderShareCard(summary, meta), [meta, summary]);

  useEffect(() => {
    if (!eventsCloudAvailable) {
      setLiveTarget(null);
      setLiveStatus(null);
      setLiveError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItem('@events/dashboard.v1');
        if (!raw) {
          if (!cancelled) {
            setLiveTarget(null);
          }
          return;
        }
        const parsed = JSON.parse(raw) as { cloud?: { id?: string; joinCode?: string; goLive?: boolean } };
        const cloud = parsed?.cloud;
        if (cloud && typeof cloud.id === 'string' && cloud.goLive) {
          if (!cancelled) {
            setLiveTarget({ eventId: cloud.id, joinCode: typeof cloud.joinCode === 'string' ? cloud.joinCode : undefined });
          }
        } else if (!cancelled) {
          setLiveTarget(null);
          setLiveStatus(null);
          setLiveError(null);
        }
      } catch {
        if (!cancelled) {
          setLiveTarget(null);
          setLiveStatus(null);
          setLiveError(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleShare = async () => {
    setShareBusy(true);
    setShareMessage(null);
    try {
      const svg = shareCard;
      const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      const { msg } = await tryShareSvg(dataUri, svg, { dialogTitle: 'Share Round Summary' });
      setShareMessage(msg);
    } catch {
      setShareMessage('Unable to share right now. Try again.');
    } finally {
      setShareBusy(false);
    }
  };

  const handleOpenQr = () => {
    try {
      const shared = buildSharedRound(round, summary);
      const encoded = encodeSharedRoundV1(shared);
      setQrValue(encoded);
      setQrMessage(null);
      setQrVisible(true);
    } catch {
      setQrMessage('Unable to build QR payload.');
      setQrVisible(true);
    }
  };

  const handleCopyQr = async () => {
    if (!qrValue) {
      return;
    }
    try {
      await Clipboard.setStringAsync(qrValue);
      setQrMessage('Copied payload to clipboard');
    } catch {
      setQrMessage('Copy failed. Try again.');
    }
  };

  const handlePostLive = useCallback(async () => {
    if (!liveTarget) {
      return;
    }
    setLiveBusy(true);
    setLiveError(null);
    setLiveStatus(null);
    try {
      const payload = buildSharedRound(round, summary);
      await postLiveRound(liveTarget.eventId, payload);
      setLiveStatus('Posted to live event');
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Unable to post to live event');
    } finally {
      setLiveBusy(false);
    }
  }, [liveTarget, round, summary]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroLabel}>Total SG</Text>
          <Text style={styles.heroValue}>{formatSigned(summary.phases.total)}</Text>
        </View>
        <View style={styles.heroRight}>
          <Text style={styles.heroLabel}>Score vs Par</Text>
          <Text style={styles.heroValue}>{formatSigned(summary.toPar ?? Number.NaN)}</Text>
        </View>
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Strokes</Text>
          <Text style={styles.metricValue}>{summary.strokes}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Putts</Text>
          <Text style={styles.metricValue}>{summary.putts}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>Penalties</Text>
          <Text style={styles.metricValue}>{summary.penalties}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>FIR</Text>
          <Text style={styles.metricValue}>{formatPercentage(summary.firPct)}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>GIR</Text>
          <Text style={styles.metricValue}>{formatPercentage(summary.girPct)}</Text>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strokes Gained by Phase</Text>
        {phaseBars.map((row) => (
          <View key={row.key} style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>{row.key}</Text>
            <View style={styles.phaseBarBackground}>
              <View style={[styles.phaseBarFill, { width: `${Math.max(6, row.ratio * 100)}%`, backgroundColor: row.color }]} />
            </View>
            <Text style={styles.phaseValue}>{row.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Clubs</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.cellClub]}>Club</Text>
          <Text style={[styles.cell, styles.cellShots]}>Shots</Text>
          <Text style={[styles.cell, styles.cellCarry]}>Avg Carry</Text>
          <Text style={[styles.cell, styles.cellSg]}>SG/Shot</Text>
        </View>
        {summary.clubs.length === 0 ? (
          <Text style={styles.emptyRow}>No club data yet.</Text>
        ) : (
          summary.clubs.map((row) => (
            <View key={row.club} style={styles.tableRow}>
              <Text style={[styles.cell, styles.cellClub]}>{row.club}</Text>
              <Text style={[styles.cell, styles.cellShots]}>{row.shots}</Text>
              <Text style={[styles.cell, styles.cellCarry]}>{formatNumber(row.avgCarry_m)}</Text>
              <Text style={[styles.cell, styles.cellSg]}>{formatNumber(row.sgPerShot)}</Text>
            </View>
          ))
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hole by Hole</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.cellHole]}>#</Text>
          <Text style={[styles.cell, styles.cellPar]}>Par</Text>
          <Text style={[styles.cell, styles.cellShots]}>Strokes</Text>
          <Text style={[styles.cell, styles.cellShots]}>Putts</Text>
          <Text style={[styles.cell, styles.cellFlag]}>GIR</Text>
          <Text style={[styles.cell, styles.cellFlag]}>FIR</Text>
          <Text style={[styles.cell, styles.cellSg]}>SG</Text>
        </View>
        {summary.holes.map((row) => (
          <View key={row.hole} style={styles.tableRow}>
            <Text style={[styles.cell, styles.cellHole]}>{row.hole}</Text>
            <Text style={[styles.cell, styles.cellPar]}>{row.par}</Text>
            <Text style={[styles.cell, styles.cellShots]}>{row.strokes}</Text>
            <Text style={[styles.cell, styles.cellShots]}>{row.putts}</Text>
            <Text style={[styles.cell, styles.cellFlag]}>{row.gir == null ? '—' : row.gir ? '✓' : '✕'}</Text>
            <Text style={[styles.cell, styles.cellFlag]}>{row.fir == null ? '—' : row.fir ? '✓' : '✕'}</Text>
            <Text style={[styles.cell, styles.cellSg]}>{formatNumber(row.sg)}</Text>
          </View>
        ))}
      </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={shareBusy}>
            {shareBusy ? <ActivityIndicator color="#0b1221" /> : <Text style={styles.shareLabel}>Share SVG Card</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.qrButton} onPress={handleOpenQr}>
            <Text style={styles.qrLabel}>Share → QR</Text>
          </TouchableOpacity>
          {eventsCloudAvailable && liveTarget ? (
            <TouchableOpacity
              style={[styles.liveButton, liveBusy && styles.liveButtonDisabled]}
              onPress={handlePostLive}
              disabled={liveBusy}
            >
              {liveBusy ? (
                <ActivityIndicator color="#4da3ff" />
              ) : (
                <Text style={styles.liveButtonLabel}>Post to Live Event</Text>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.doneButton} onPress={onDone}>
            <Text style={styles.doneLabel}>Done</Text>
          </TouchableOpacity>
        </View>
        {liveError ? <Text style={styles.liveError}>{liveError}</Text> : null}
        {liveStatus ? <Text style={styles.liveStatus}>{liveStatus}</Text> : null}
        {shareMessage ? <Text style={styles.shareMessage}>{shareMessage}</Text> : null}
      </ScrollView>
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.qrBackdrop}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Round QR Payload</Text>
            {qrValue ? <QRCode value={qrValue} size={280} /> : <ActivityIndicator color="#0b1221" />}
            <TouchableOpacity style={styles.qrCopyButton} onPress={handleCopyQr} disabled={!qrValue}>
              <Text style={styles.qrCopyLabel}>Copy JSON</Text>
            </TouchableOpacity>
            {qrMessage ? <Text style={styles.qrMessage}>{qrMessage}</Text> : null}
            <TouchableOpacity style={styles.qrCloseButton} onPress={() => setQrVisible(false)}>
              <Text style={styles.qrCloseLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
    gap: 24,
    backgroundColor: '#0a0f1d',
    flexGrow: 1,
  },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#141c2f',
    padding: 24,
    borderRadius: 20,
  },
  heroLabel: {
    color: '#8ea0c9',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: '700',
  },
  heroRight: {
    alignItems: 'flex-end',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricTile: {
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: '#141c2f',
    padding: 12,
    borderRadius: 16,
  },
  metricLabel: {
    color: '#8ea0c9',
    fontWeight: '600',
    fontSize: 14,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#141c2f',
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phaseLabel: {
    width: 56,
    color: '#ffffff',
    fontWeight: '600',
  },
  phaseBarBackground: {
    flex: 1,
    height: 14,
    borderRadius: 8,
    backgroundColor: '#1f2a43',
    overflow: 'hidden',
  },
  phaseBarFill: {
    height: '100%',
    borderRadius: 8,
  },
  phaseValue: {
    width: 80,
    textAlign: 'right',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomColor: '#1f2a43',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomColor: '#1f2a43',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    color: '#ffffff',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  cellClub: { flex: 2 },
  cellShots: { flex: 1, textAlign: 'center' as const },
  cellCarry: { flex: 1.4, textAlign: 'right' as const },
  cellSg: { flex: 1.1, textAlign: 'right' as const },
  cellHole: { flex: 0.7 },
  cellPar: { flex: 0.8, textAlign: 'center' as const },
  cellFlag: { flex: 0.9, textAlign: 'center' as const },
  emptyRow: {
    color: '#8ea0c9',
    paddingVertical: 12,
  },
  actions: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#4da3ff',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  shareLabel: {
    color: '#0a0f1d',
    fontWeight: '700',
    fontSize: 16,
  },
  qrButton: {
    flex: 1,
    backgroundColor: '#0b1221',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4da3ff',
  },
  qrLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  liveButton: {
    flex: 1,
    backgroundColor: '#0b1221',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4da3ff',
  },
  liveButtonDisabled: {
    opacity: 0.6,
  },
  liveButtonLabel: {
    color: '#4da3ff',
    fontWeight: '700',
    fontSize: 16,
  },
  doneButton: {
    flexBasis: 96,
    backgroundColor: '#1f2a43',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  doneLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  liveStatus: {
    color: '#4da3ff',
    textAlign: 'center',
    marginTop: 8,
  },
  liveError: {
    color: '#ff7b7b',
    textAlign: 'center',
    marginTop: 8,
  },
  shareMessage: {
    color: '#8ea0c9',
    textAlign: 'center',
    marginTop: 12,
  },
  qrBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 29, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0b1221',
  },
  qrCopyButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#4da3ff',
  },
  qrCopyLabel: {
    color: '#0b1221',
    fontWeight: '600',
    fontSize: 15,
  },
  qrMessage: {
    fontSize: 14,
    color: '#0b1221',
  },
  qrCloseButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#0b1221',
  },
  qrCloseLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
});
