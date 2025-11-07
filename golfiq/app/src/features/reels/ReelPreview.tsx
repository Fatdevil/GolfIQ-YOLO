import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';

import {
  makeTimeline,
  mapRoundShotToReelRef,
  pickTopShots,
  planFrame,
} from '../../../../../shared/reels/select';
import type { DrawCmd, ReelShotRef } from '../../../../../shared/reels/types';
import { loadRound } from '../../../../../shared/round/round_store';
import type { Round } from '../../../../../shared/round/round_types';

const PREVIEW_SCALE = 0.28;
const MAX_RECENT_SHOTS = 20;

type ReelPreviewProps = {
  visible: boolean;
  onClose: () => void;
};

type FrameProps = {
  width: number;
  height: number;
  commands: DrawCmd[];
};

type TextAlign = Extract<DrawCmd, { t: 'text' }>['align'];

function collectRoundShots(round: Round | null): ReelShotRef[] {
  if (!round) {
    return [];
  }
  const refs: ReelShotRef[] = [];
  for (const hole of round.holes) {
    hole.shots.forEach((shot, index) => {
      const ref = mapRoundShotToReelRef(shot, { roundId: round.id, holeNo: hole.holeNo, index });
      refs.push(ref);
    });
  }
  refs.sort((a, b) => b.ts - a.ts);
  return refs.slice(0, MAX_RECENT_SHOTS);
}

function encodePayload(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    const base = Buffer.from(json, 'utf8').toString('base64');
    return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (error) {
    return '';
  }
}

function alignToAnchor(align: TextAlign | undefined): 'start' | 'middle' | 'end' {
  switch (align) {
    case 'center':
      return 'middle';
    case 'right':
      return 'end';
    default:
      return 'start';
  }
}

const ReelFrame: React.FC<FrameProps> = ({ width, height, commands }) => {
  const background = useMemo(() => {
    const bg = commands.find((cmd) => cmd.t === 'bg');
    return bg?.color ?? '#0b0f14';
  }, [commands]);

  const rects = commands.filter((cmd): cmd is Extract<DrawCmd, { t: 'bar' }> => cmd.t === 'bar');
  const tracers = commands.filter((cmd): cmd is Extract<DrawCmd, { t: 'tracer' }> => cmd.t === 'tracer');
  const dots = commands.filter((cmd): cmd is Extract<DrawCmd, { t: 'dot' }> => cmd.t === 'dot');
  const texts = commands.filter((cmd): cmd is Extract<DrawCmd, { t: 'text' }> => cmd.t === 'text');
  const compasses = commands.filter((cmd): cmd is Extract<DrawCmd, { t: 'compass' }> => cmd.t === 'compass');

  return (
    <View style={[styles.frameContainer, { width, height, backgroundColor: background }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0} y={0} width={width} height={height} fill={background} />
        {rects.map((cmd, index) => (
          <Rect key={`bar-${index}`} x={cmd.x} y={cmd.y} width={cmd.w} height={cmd.h} fill={cmd.color} />
        ))}
        {tracers.map((cmd, index) => {
          if (!cmd.pts.length) {
            return null;
          }
          const path = `M ${cmd.pts[0][0]} ${cmd.pts[0][1]} ` +
            cmd.pts
              .slice(1)
              .map((pt) => `L ${pt[0]} ${pt[1]}`)
              .join(' ');
          return (
            <Path
              key={`tracer-${index}`}
              d={path}
              fill="none"
              stroke={cmd.color}
              strokeWidth={cmd.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={cmd.dash}
            />
          );
        })}
        {compasses.map((cmd, index) => {
          const rad = ((cmd.deg ?? 0) - 90) * (Math.PI / 180);
          const pointerX = cmd.cx + Math.cos(rad) * cmd.radius;
          const pointerY = cmd.cy + Math.sin(rad) * cmd.radius;
          return (
            <G key={`compass-${index}`}>
              <Circle cx={cmd.cx} cy={cmd.cy} r={cmd.radius} stroke={cmd.color} strokeWidth={6} fill="none" />
              <Circle cx={cmd.cx} cy={cmd.cy} r={6} fill={cmd.color} />
              <Path
                d={`M ${cmd.cx} ${cmd.cy} L ${pointerX} ${pointerY}`}
                stroke={cmd.color}
                strokeWidth={6}
                strokeLinecap="round"
              />
            </G>
          );
        })}
        {dots.map((cmd, index) => (
          <Circle key={`dot-${index}`} cx={cmd.x} cy={cmd.y} r={cmd.r} fill={cmd.color} />
        ))}
        {texts.map((cmd, index) => (
          <SvgText
            key={`text-${index}`}
            x={cmd.x}
            y={cmd.y}
            fill={cmd.color}
            fontSize={cmd.size}
            fontWeight={cmd.bold ? '600' : '400'}
            textAnchor={alignToAnchor(cmd.align)}
            alignmentBaseline="middle"
          >
            {cmd.text}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

const ReelPreview: React.FC<ReelPreviewProps> = ({ visible, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<ReelShotRef[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const viewShotRef = useRef<ViewShot | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRound()
      .then((round) => {
        if (cancelled) {
          return;
        }
        const refs = collectRoundShots(round);
        setShots(refs);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load shots');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const selectedShots = useMemo(() => pickTopShots(shots, 2), [shots]);
  const timeline = useMemo(() => (selectedShots.length ? makeTimeline(selectedShots) : null), [selectedShots]);
  const commands = useMemo(() => (timeline ? planFrame(timeline, 0) : []), [timeline]);

  const env = useMemo(() => {
    const globalEnv =
      typeof globalThis !== 'undefined'
        ? ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})
        : {};
    return globalEnv;
  }, []);

  const composerUrl = useMemo(() => {
    if (!timeline || !selectedShots.length) {
      return '';
    }
    const payload = encodePayload({ shots: selectedShots, timeline });
    if (!payload) {
      return '';
    }
    const base = (env.EXPO_PUBLIC_REELS_COMPOSER_URL ?? env.EXPO_PUBLIC_WEB_BASE ?? 'https://app.golfiq.dev')
      .toString()
      .replace(/\/$/, '');
    return `${base}/reels?payload=${payload}`;
  }, [env, selectedShots, timeline]);

  const handleShareCard = useCallback(async () => {
    if (!timeline || !viewShotRef.current) {
      return;
    }
    try {
      setShareBusy(true);
      setShareMessage(null);
      setShareError(false);
      const uri = await captureRef(viewShotRef, {
        result: 'tmpfile',
        format: 'png',
        quality: 0.95,
        width: timeline.width,
        height: timeline.height,
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setShareMessage('Sharing is not available on this device.');
        setShareError(true);
        return;
      }
      await Sharing.shareAsync(uri);
      setShareMessage('Share card exported.');
      setShareError(false);
    } catch (err) {
      setShareMessage('Unable to export share card.');
      setShareError(true);
    } finally {
      setShareBusy(false);
    }
  }, [timeline]);

  const hasShots = selectedShots.length > 0 && timeline;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.title}>Auto Reel Preview</Text>
          <Text style={styles.subtitle}>Pick top swings, preview overlays, and hand-off to the web composer.</Text>
          {loading ? (
            <ActivityIndicator color="#60a5fa" size="large" style={styles.loading} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !hasShots ? (
            <Text style={styles.empty}>Need at least one tracked swing to build a reel.</Text>
          ) : (
            <View style={styles.previewBlock}>
              <View
                style={[
                  styles.previewShell,
                  {
                    width: timeline.width,
                    height: timeline.height,
                    transform: [{ scale: PREVIEW_SCALE }],
                  },
                ]}
              >
                <ViewShot ref={viewShotRef} style={{ width: timeline.width, height: timeline.height }}>
                  <ReelFrame width={timeline.width} height={timeline.height} commands={commands} />
                </ViewShot>
              </View>
              <View style={styles.shotList}>
                {timeline.shots.map((entry, index) => (
                  <View
                    key={entry.ref.id}
                    style={[styles.shotCard, index > 0 && styles.shotCardSpacer]}
                  >
                    <Text style={styles.shotTitle}>
                      {entry.ref.club ?? '—'} · {Math.round(entry.ref.carry_m ?? 0)} m carry
                    </Text>
                    <Text style={styles.shotMeta}>
                      Total {Math.round(entry.ref.total_m ?? entry.ref.carry_m ?? 0)} m · PL{' '}
                      {entry.ref.playsLikePct != null ? entry.ref.playsLikePct.toFixed(1) : '0.0'}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, (!hasShots || shareBusy) && styles.actionButtonDisabled]}
              onPress={handleShareCard}
              disabled={!hasShots || shareBusy}
            >
              <Text style={styles.actionButtonLabel}>{shareBusy ? 'Sharing…' : 'Share Card'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton, (!composerUrl || !hasShots) && styles.actionButtonDisabled]}
              onPress={() => setQrVisible(true)}
              disabled={!composerUrl || !hasShots}
            >
              <Text style={styles.actionButtonLabel}>Open in Web Composer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.closeButton]} onPress={onClose}>
              <Text style={styles.closeButtonLabel}>Close</Text>
            </TouchableOpacity>
            {shareMessage ? (
              <Text style={[styles.shareMessage, shareError && styles.shareMessageError]}>{shareMessage}</Text>
            ) : null}
          </View>
        </ScrollView>
        <Modal
          visible={qrVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setQrVisible(false)}
        >
          <View style={styles.qrBackdrop}>
            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>Scan to continue on the web</Text>
              <View style={styles.qrCodeWrapper}>
                {composerUrl ? (
                  <QRCode value={composerUrl} size={220} />
                ) : (
                  <ActivityIndicator color="#0b1221" />
                )}
              </View>
              <TouchableOpacity style={styles.qrCloseButton} onPress={() => setQrVisible(false)}>
                <Text style={styles.qrCloseLabel}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#050a18',
  },
  modalContent: {
    padding: 24,
    paddingBottom: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    marginTop: 4,
    color: '#93c5fd',
    fontSize: 14,
  },
  loading: {
    marginTop: 48,
  },
  error: {
    marginTop: 32,
    color: '#f87171',
    fontSize: 16,
  },
  empty: {
    marginTop: 32,
    color: '#cbd5f5',
    fontSize: 16,
  },
  previewBlock: {
    marginTop: 32,
    alignItems: 'center',
  },
  previewShell: {
    borderRadius: 48,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  frameContainer: {
    borderRadius: 48,
    overflow: 'hidden',
  },
  shotList: {
    marginTop: 32,
    width: '100%',
  },
  shotCard: {
    backgroundColor: '#111b2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  shotCardSpacer: {
    marginTop: 12,
  },
  shotTitle: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 16,
  },
  shotMeta: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 13,
  },
  actions: {
    marginTop: 32,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#60a5fa',
    marginTop: 12,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonLabel: {
    color: '#0b1221',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#1f2a44',
  },
  closeButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  closeButtonLabel: {
    color: '#cbd5f5',
    fontSize: 16,
    fontWeight: '600',
  },
  shareMessage: {
    marginTop: 8,
    textAlign: 'center',
    color: '#cbd5f5',
    fontSize: 13,
  },
  shareMessageError: {
    color: '#f87171',
  },
  qrBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 24, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0b1221',
  },
  qrCodeWrapper: {
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCloseButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#0b1221',
  },
  qrCloseLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ReelPreview;
