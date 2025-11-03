import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import RoundWizard, { type WizardStartPayload } from './RoundWizard';
import RoundSummaryScreen from './RoundSummaryScreen';
import { useFollowLoop } from '../follow/useFollowLoop';
import type { HoleRef } from '../../../../shared/follow/types';
import type { RoundState } from '../../../../shared/round/types';
import { RoundRecorder } from '../../../../shared/round/recorder';
import { buildRoundSummary, type RoundSummary } from '../../../../shared/round/summary';
import { loadDefaultBaselines } from '../../../../shared/sg/baseline';
import { recordRoundFinish } from '../../../../shared/telemetry/round';
import { notifyRoundSaved } from '../watch/bridge';
import type { ShareCardMeta } from '../components/summary/ShareCard';
import OverlayControls from '../components/overlay/OverlayControls';
import VectorHole from '../components/overlay/VectorHole';
import type { BagStats } from '../../../../shared/bag/types';
import { loadBagStats } from '../../../../shared/bag/storage';
import type { VectorHoleModel } from '../../../../shared/overlay/vector';
import type { XY } from '../../../../shared/overlay/geom';
import { AutoReviewBanner } from '../components/shotsense/AutoReviewBanner';

const EMPTY_HOLES: HoleRef[] = [];
const BASELINES = loadDefaultBaselines();
const EMPTY_BAG: BagStats = { updatedAt: 0, clubs: {} };

type Mode = 'wizard' | 'tracking' | 'summary';

type FinishState = {
  preview: RoundSummary | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
};

function resolveTelemetryEmitter(): ((event: string, payload: Record<string, unknown>) => void) | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as { __ARHUD_QA_TELEMETRY__?: unknown };
  const candidate = holder.__ARHUD_QA_TELEMETRY__;
  return typeof candidate === 'function' ? (candidate as (event: string, payload: Record<string, unknown>) => void) : null;
}

function formatMeters(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) {
    return '--';
  }
  return `${Math.round(value!)} m`;
}

export default function FollowScreen(): JSX.Element {
  const [mode, setMode] = useState<Mode>('wizard');
  const [round, setRound] = useState<RoundState | null>(null);
  const [meta, setMeta] = useState<ShareCardMeta | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [finishVisible, setFinishVisible] = useState(false);
  const [finishState, setFinishState] = useState<FinishState>({ preview: null, loading: false, busy: false, error: null });

  const handleStart = useCallback(
    ({ round: startedRound, meta: nextMeta }: WizardStartPayload) => {
      setRound(startedRound);
      setMeta(nextMeta);
      setSummary(null);
      setMode('tracking');
    },
    [],
  );

  const handleResume = useCallback((resumed: RoundState, courseName?: string | null) => {
    const nextMeta: ShareCardMeta = {
      courseId: resumed.courseId,
      courseName: courseName ?? resumed.courseId,
      holeCount: Object.keys(resumed.holes).length,
      tournamentSafe: resumed.tournamentSafe,
      startedAt: resumed.startedAt,
      finishedAt: resumed.finishedAt,
    };
    setRound(resumed);
    setMeta(nextMeta);
    setSummary(null);
    setMode('tracking');
  }, []);

  const refreshFinishPreview = useCallback(async () => {
    setFinishState({ preview: null, loading: true, busy: false, error: null });
    try {
      const latest = (await RoundRecorder.getStoredRound()) ?? round;
      if (!latest || latest.finishedAt) {
        throw new Error('No active round to finish.');
      }
      const previewSummary = buildRoundSummary(latest, BASELINES);
      setRound(latest);
      setFinishState({ preview: previewSummary, loading: false, busy: false, error: null });
    } catch (error) {
      setFinishState({ preview: null, loading: false, busy: false, error: (error as Error)?.message ?? 'Unable to load round.' });
    }
  }, [round]);

  const openFinishDialog = useCallback(async () => {
    setFinishVisible(true);
    await refreshFinishPreview();
  }, [refreshFinishPreview]);

  const closeFinishDialog = useCallback(() => {
    if (finishState.busy) {
      return;
    }
    setFinishVisible(false);
    setFinishState((prev) => ({ ...prev, error: null }));
  }, [finishState.busy]);

  const confirmFinish = useCallback(async () => {
    if (!round) {
      return;
    }
    setFinishState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const finishedAt = Date.now();
      const finished = await RoundRecorder.finishRound(finishedAt);
      const nextSummary = buildRoundSummary(finished, BASELINES);
      const baseMeta: ShareCardMeta = meta ?? {
        courseId: finished.courseId,
        courseName: finished.courseId,
        holeCount: Object.keys(finished.holes).length,
        tournamentSafe: finished.tournamentSafe,
        startedAt: finished.startedAt,
      };
      const updatedMeta: ShareCardMeta = { ...baseMeta, finishedAt };
      setMeta(updatedMeta);
      setRound(finished);
      setSummary(nextSummary);
      setMode('summary');
      setFinishVisible(false);
      setFinishState({ preview: null, loading: false, busy: false, error: null });
      const durationMin = Math.max(0, (finishedAt - baseMeta.startedAt) / 60000);
      recordRoundFinish({
        strokes: nextSummary.strokes,
        putts: nextSummary.putts,
        penalties: nextSummary.penalties,
        sg: nextSummary.phases,
        firPct: nextSummary.firPct,
        girPct: nextSummary.girPct,
        durationMin,
      });
      try {
        notifyRoundSaved();
      } catch {
        // ignore watch notification failures
      }
    } catch (error) {
      setFinishState((prev) => ({ ...prev, busy: false, error: (error as Error)?.message ?? 'Unable to finish round.' }));
    }
  }, [meta, round]);

  const handleSummaryDone = useCallback(() => {
    setMode('wizard');
    setRound(null);
    setSummary(null);
  }, []);

  const content = useMemo(() => {
    if (mode === 'wizard') {
      return <RoundWizard onStart={handleStart} onResume={handleResume} />;
    }
    if (mode === 'summary' && summary && meta && round) {
      return <RoundSummaryScreen summary={summary} meta={meta} round={round} onDone={handleSummaryDone} />;
    }
    if (mode === 'tracking' && round) {
      return (
        <TrackingView
          round={round}
          meta={meta}
          onFinishPress={openFinishDialog}
          finishDisabled={finishState.loading || finishState.busy}
        />
      );
    }
    return <RoundWizard onStart={handleStart} onResume={handleResume} />;
  }, [finishState.busy, finishState.loading, handleResume, handleStart, handleSummaryDone, meta, mode, openFinishDialog, round, summary]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {content}
      <Modal visible={finishVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finish round?</Text>
            {finishState.loading ? (
              <ActivityIndicator color="#4da3ff" />
            ) : finishState.preview ? (
              <View style={styles.modalStats}>
                <Text style={styles.modalStat}>Strokes {finishState.preview.strokes}</Text>
                <Text style={styles.modalStat}>Putts {finishState.preview.putts}</Text>
                <Text style={styles.modalStat}>Penalties {finishState.preview.penalties}</Text>
              </View>
            ) : null}
            {finishState.error ? <Text style={styles.modalError}>{finishState.error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={closeFinishDialog} disabled={finishState.busy}>
                <Text style={styles.modalButtonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={confirmFinish}
                disabled={finishState.busy || finishState.loading || !finishState.preview}
              >
                {finishState.busy ? <ActivityIndicator color="#0a0f1d" /> : <Text style={styles.modalConfirmLabel}>Finish</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type TrackingViewProps = {
  round: RoundState;
  meta: ShareCardMeta | null;
  finishDisabled: boolean;
  onFinishPress: () => void;
};

function TrackingView({ round, meta, finishDisabled, onFinishPress }: TrackingViewProps): JSX.Element {
  const [bagStats, setBagStats] = useState<BagStats | null>(null);
  const [overlaySize, setOverlaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [overlayEnabled, setOverlayEnabled] = useState<boolean>(!(meta?.tournamentSafe ?? true));
  const [showCorridor, setShowCorridor] = useState<boolean>(true);
  const [showRing, setShowRing] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(false);

  const telemetryEmitter = useMemo(() => resolveTelemetryEmitter(), []);
  const {
    followState,
    snapshot,
    gpsWeak,
    watchAutoSend,
    setWatchAutoSend,
    setAutoAdvance,
    autoMode,
    setAutoMode,
    manualNext,
    manualPrev,
    recenter,
  } = useFollowLoop({
    roundId: round.id,
    holes: EMPTY_HOLES,
    tournamentSafe: meta?.tournamentSafe ?? true,
    playsLikePct: null,
    watchAutoSend: true,
    telemetryEmitter,
  });

  const autoAdvanceLabel = followState?.autoAdvanceEnabled
    ? autoMode === 'v2'
      ? 'On (v2)'
      : 'On (v1)'
    : 'Off';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await loadBagStats();
        if (!cancelled) {
          setBagStats(stats);
        }
      } catch {
        if (!cancelled) {
          setBagStats(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tournamentSafe = meta?.tournamentSafe ?? true;

  useEffect(() => {
    if (tournamentSafe) {
      setOverlayEnabled(false);
      setShowLabels(false);
    }
  }, [tournamentSafe]);

  useEffect(() => {
    if (!overlayEnabled && showLabels) {
      setShowLabels(false);
    }
  }, [overlayEnabled, showLabels]);

  const handleOverlayLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout ?? {};
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }
    setOverlaySize((prev) => {
      if (prev.w === width && prev.h === height) {
        return prev;
      }
      return { w: width, h: height };
    });
  }, []);

  const overlayBag: BagStats = bagStats ?? EMPTY_BAG;
  const vectorHoleModel: VectorHoleModel | null = null;
  const teeVector: XY | null = null;
  const targetVector: XY | null = null;
  const labelsAllowed = overlayEnabled && showLabels && !tournamentSafe;
  const overlayActive = overlayEnabled && overlaySize.w > 0 && overlaySize.h > 0;

  return (
    <SafeAreaView style={styles.trackContainer}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.holeLabel}>HOLE {snapshot?.holeNo ?? '--'}</Text>
          <Text style={styles.subLabel}>Auto-advance: {autoAdvanceLabel}</Text>
          {meta ? <Text style={styles.courseLabel}>{meta.courseName ?? meta.courseId}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={onFinishPress}
          style={[styles.finishButton, finishDisabled && styles.finishButtonDisabled]}
          disabled={finishDisabled}
        >
          <Text style={styles.finishButtonLabel}>Finish</Text>
        </TouchableOpacity>
      </View>
      {gpsWeak ? <Text style={styles.gpsWarning}>Waiting for GPS…</Text> : null}
      {EMPTY_HOLES.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Download course to enable Follow.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.distancesRow}>
            <View style={styles.sideDistance}>
              <Text style={styles.sideLabel}>FRONT</Text>
              <Text style={styles.sideValue}>{formatMeters(snapshot?.fmb.front)}</Text>
            </View>
            <View style={styles.middleDistance}>
              <Text style={styles.middleValue}>{formatMeters(snapshot?.fmb.middle)}</Text>
              <Text style={styles.middleLabel}>MIDDLE</Text>
            </View>
            <View style={styles.sideDistance}>
              <Text style={styles.sideLabel}>BACK</Text>
              <Text style={styles.sideValue}>{formatMeters(snapshot?.fmb.back)}</Text>
            </View>
          </View>
          <View style={styles.headingSection}>
            <View style={[styles.headingArrow, { transform: [{ rotate: `${snapshot?.headingDeg ?? 0}deg` }] }]} />
            <Text style={styles.headingText}>{Math.round(snapshot?.headingDeg ?? 0)}°</Text>
          </View>
          <View style={styles.overlayCard}>
            <View style={styles.overlayCanvas} onLayout={handleOverlayLayout}>
              {overlayActive && vectorHoleModel && teeVector && targetVector ? (
                <VectorHole
                  holeModel={vectorHoleModel}
                  teeXY={teeVector}
                  targetXY={targetVector}
                  bag={overlayBag}
                  showCorridor={showCorridor}
                  showRing={showRing}
                  labelsAllowed={labelsAllowed}
                  size={overlaySize}
                />
              ) : (
                <View style={styles.overlayPlaceholder}>
                  <Text style={styles.overlayPlaceholderText}>
                    {overlayEnabled
                      ? 'Vector overlay unavailable for this hole.'
                      : 'Enable Vector Overlay to preview aim guidance.'}
                  </Text>
                </View>
              )}
            </View>
            <OverlayControls
              enabled={overlayEnabled}
              showCorridor={showCorridor}
              showRing={showRing}
              showLabels={showLabels}
              labelsAvailable={!tournamentSafe}
              onToggleEnabled={(value) => setOverlayEnabled(value)}
              onToggleCorridor={(value) => setShowCorridor(value)}
              onToggleRing={(value) => setShowRing(value)}
              onToggleLabels={(value) => setShowLabels(value)}
            />
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={() => void manualPrev()} style={styles.button}>
              <Text style={styles.buttonText}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={recenter} style={styles.button}>
              <Text style={styles.buttonText}>Re-center</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void manualNext()} style={styles.button}>
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.toggleRowTrack}>
            <Text style={styles.toggleLabel}>Auto-Advance</Text>
            <Switch value={Boolean(followState?.autoAdvanceEnabled)} onValueChange={(value) => void setAutoAdvance(value)} />
          </View>
          <View style={styles.toggleRowTrack}>
            <Text style={styles.toggleLabel}>Auto Mode</Text>
            <View style={styles.modeToggleGroup}>
              <TouchableOpacity
                onPress={() => void setAutoMode('v1')}
                style={[styles.modeToggleOption, autoMode === 'v1' && styles.modeToggleOptionActive]}
              >
                <Text
                  style={[styles.modeToggleOptionLabel, autoMode === 'v1' && styles.modeToggleOptionLabelActive]}
                >
                  v1 legacy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void setAutoMode('v2')}
                style={[styles.modeToggleOption, autoMode === 'v2' && styles.modeToggleOptionActive]}
              >
                <Text
                  style={[styles.modeToggleOptionLabel, autoMode === 'v2' && styles.modeToggleOptionLabelActive]}
                >
                  v2 geometry
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.toggleRowTrack}>
            <Text style={styles.toggleLabel}>Watch Auto-Send</Text>
            <Switch value={watchAutoSend} onValueChange={setWatchAutoSend} />
          </View>
        </View>
      )}
      <AutoReviewBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0f1d' },
  trackContainer: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  holeLabel: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  subLabel: { color: '#bbb', marginTop: 4 },
  courseLabel: { color: '#4da3ff', marginTop: 4, fontWeight: '600' },
  finishButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#4da3ff',
  },
  finishButtonDisabled: { opacity: 0.6 },
  finishButtonLabel: { color: '#0a0f1d', fontWeight: '700' },
  gpsWarning: { color: '#f5d742', marginBottom: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 16, textAlign: 'center' },
  content: { gap: 20 },
  distancesRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sideDistance: { alignItems: 'center', flex: 1 },
  middleDistance: { alignItems: 'center', flex: 1.4 },
  sideLabel: { color: '#bbb', fontSize: 12, letterSpacing: 1 },
  sideValue: { color: '#fff', fontSize: 22, fontWeight: '600' },
  middleValue: { color: '#fff', fontSize: 48, fontWeight: '700' },
  middleLabel: { color: '#bbb', letterSpacing: 1, marginTop: 4 },
  headingSection: { alignItems: 'center', gap: 8 },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#4da3ff',
  },
  headingText: { color: '#4da3ff', fontSize: 16, fontWeight: '600' },
  overlayCard: {
    backgroundColor: '#0f1524',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.18)',
    overflow: 'hidden',
  },
  overlayCanvas: {
    width: '100%',
    aspectRatio: 1.6,
    backgroundColor: '#070d1a',
  },
  overlayPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  overlayPlaceholderText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  button: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: '#1f1f1f',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  toggleRowTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#151515',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleLabel: { color: '#fff', fontSize: 16 },
  modeToggleGroup: { flexDirection: 'row', gap: 8 },
  modeToggleOption: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1f2a43' },
  modeToggleOptionActive: { backgroundColor: '#4da3ff' },
  modeToggleOptionLabel: { color: '#8ea0c9', fontWeight: '600' },
  modeToggleOptionLabelActive: { color: '#0a0f1d' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0f1524',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  modalStats: { gap: 4 },
  modalStat: { color: '#8ea0c9', fontSize: 16 },
  modalError: { color: '#ff6b8a', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#1f2a43' },
  modalButtonLabel: { color: '#ffffff', fontWeight: '600' },
  modalConfirm: { backgroundColor: '#4da3ff' },
  modalConfirmLabel: { color: '#0a0f1d', fontWeight: '700' },
});
