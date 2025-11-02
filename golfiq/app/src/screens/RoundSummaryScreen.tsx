import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import type { RoundSummary } from '../../../../shared/round/summary';
import { render as renderShareCard, type ShareCardMeta } from '../components/summary/ShareCard';

type RoundSummaryScreenProps = {
  summary: RoundSummary;
  meta: ShareCardMeta;
  onDone: () => void;
};

type ExpoSharingModule = typeof import('expo-sharing');
type ExpoFileSystemModule = typeof import('expo-file-system');

async function tryShareSvg(dataUri: string, svgRaw: string): Promise<{ ok: boolean; msg: string }> {
  if (Platform.OS === 'web') {
    try {
      await Linking.openURL(dataUri);
      return { ok: true, msg: 'Opened share card in new tab' };
    } catch {
      // fallthrough to clipboard
    }
    await Clipboard.setStringAsync(svgRaw);
    return { ok: true, msg: 'Copied SVG to clipboard' };
  }

  let Sharing: ExpoSharingModule | null = null;
  let FileSystem: ExpoFileSystemModule | null = null;
  try {
    Sharing = await import('expo-sharing');
  } catch {
    Sharing = null;
  }
  try {
    FileSystem = await import('expo-file-system');
  } catch {
    FileSystem = null;
  }

  const available = !!Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync());

  if (available && FileSystem?.writeAsStringAsync) {
    const path = `${FileSystem.cacheDirectory ?? ''}golfiq-summary.svg`;
    const encoding = FileSystem?.EncodingType?.UTF8 ?? 'utf8';
    await FileSystem.writeAsStringAsync(path, svgRaw, { encoding });
    await Sharing.shareAsync(path, {
      mimeType: 'image/svg+xml',
      dialogTitle: 'Share Round Summary',
    });
    return { ok: true, msg: 'Shared summary card' };
  }

  await Clipboard.setStringAsync(svgRaw);
  return { ok: true, msg: 'Sharing not available — copied SVG to clipboard' };
}

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

export default function RoundSummaryScreen({ summary, meta, onDone }: RoundSummaryScreenProps): JSX.Element {
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

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

  const handleShare = async () => {
    setShareBusy(true);
    setShareMessage(null);
    try {
      const svg = shareCard;
      const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      const { msg } = await tryShareSvg(dataUri, svg);
      setShareMessage(msg);
    } catch {
      setShareMessage('Unable to share right now. Try again.');
    } finally {
      setShareBusy(false);
    }
  };

  return (
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
        <TouchableOpacity style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneLabel}>Done</Text>
        </TouchableOpacity>
        {shareMessage ? <Text style={styles.shareMessage}>{shareMessage}</Text> : null}
      </View>
    </ScrollView>
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
    gap: 12,
  },
  shareButton: {
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
  doneButton: {
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
  shareMessage: {
    color: '#8ea0c9',
    textAlign: 'center',
  },
});
