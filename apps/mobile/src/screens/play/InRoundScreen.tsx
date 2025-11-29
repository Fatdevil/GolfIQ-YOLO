import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchAccessPlan, fetchPlayerProfile, type AccessPlan } from '@app/api/player';
import { fetchCourseBundle, type CourseBundle } from '@app/api/courses';
import type { RootStackParamList } from '@app/navigation/types';
import {
  countScoredHoles,
  finishCurrentRound,
  getHoleScore,
  loadCurrentRun,
  saveCurrentRun,
  updateHoleScore,
  type CurrentRun,
} from '@app/run/currentRun';
import { createRunForCurrentRound } from '@app/api/runs';
import { syncHoleHud, type HudSyncContext } from '@app/watch/HudSyncService';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Props = NativeStackScreenProps<RootStackParamList, 'PlayInRound'>;

export default function InRoundScreen({ navigation, route }: Props): JSX.Element {
  const [run, setRun] = useState<CurrentRun | null>(null);
  const [bundle, setBundle] = useState<CourseBundle | null>(route.params?.bundle ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [plan, setPlan] = useState<AccessPlan | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [hudStatus, setHudStatus] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedRun = await loadCurrentRun();
      if (!storedRun) {
        navigation.navigate('PlayerHome');
        return;
      }
      setRun(storedRun);
      if (!bundle) {
        const fetched = await fetchCourseBundle(storedRun.courseId);
        setBundle(fetched);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load round';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [bundle, navigation]);

  useEffect(() => {
    hydrate().catch(() => {
      /* handled */
    });
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [access, profile] = await Promise.all([fetchAccessPlan(), fetchPlayerProfile()]);
        if (cancelled) return;
        setPlan(access);
        setMemberId(profile.memberId);
      } catch {
        if (!cancelled) {
          setPlan((prev) => prev ?? { plan: 'free' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hole = useMemo(() => {
    if (!bundle || !run) return null;
    const safeHole = clamp(run.currentHole, 1, run.holes);
    const found = bundle.holes.find((h) => h.number === safeHole);
    return found ?? null;
  }, [bundle, run]);

  useEffect(() => {
    if (!run || run.runId) return;
    let cancelled = false;
    (async () => {
      try {
        const created = await createRunForCurrentRound(run);
        if (cancelled) return;
        const updated = { ...run, runId: created.runId } as CurrentRun;
        setRun(updated);
        await saveCurrentRun(updated);
      } catch {
        // Ignore failures; finishing flow will retry
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [run]);

  const handleAdvance = useCallback(
    async (delta: number) => {
      if (!run) return;
      const nextHole = clamp(run.currentHole + delta, 1, run.holes);
      const updated = { ...run, currentHole: nextHole } as CurrentRun;
      setRun(updated);
      await saveCurrentRun(updated);
    },
    [run],
  );

  const handleScoreChange = useCallback(
    async (field: 'strokes' | 'putts', delta: number) => {
      if (!run) return;
      const score = getHoleScore(run, run.currentHole);
      const nextValue = field === 'strokes' ? score.strokes + delta : score.putts + delta;
      const updated = await updateHoleScore(run, run.currentHole, {
        ...score,
        [field]: field === 'strokes' ? Math.max(1, nextValue) : Math.max(0, nextValue),
      });
      setRun(updated);
    },
    [run],
  );

  const handleToggle = useCallback(
    async (field: 'gir' | 'fir') => {
      if (!run) return;
      const score = getHoleScore(run, run.currentHole);
      const updated = await updateHoleScore(run, run.currentHole, { ...score, [field]: !score[field] });
      setRun(updated);
    },
    [run],
  );

  useEffect(() => {
    if (!run || !bundle || !memberId) return;
    if (plan?.plan !== 'pro') return;
    if (!run.runId) return;

    const currentHole = clamp(run.currentHole, 1, run.holes);
    const holeMeta = bundle.holes.find((h) => h.number === currentHole);
    const ctx: HudSyncContext = {
      memberId,
      runId: run.runId,
      courseId: run.courseId,
      courseName: run.courseName,
      teeName: run.teeName,
      holes: run.holes,
      currentHole,
      par: holeMeta?.par ?? null,
      strokeIndex: holeMeta?.index ?? null,
      lengthMeters: holeMeta?.lengthMeters ?? null,
    };

    syncHoleHud(ctx)
      .then(() => setHudStatus(`HUD updated for hole ${currentHole}`))
      .catch(() => {
        setHudStatus(null);
      });
  }, [bundle, memberId, plan?.plan, run?.currentHole, run?.runId, run?.courseId, run?.courseName, run?.teeName, run?.holes]);

  const handleFinish = useCallback(async () => {
    if (!run || !bundle) return;
    setFinishing(true);
    setFinishError(null);
    setConfirmVisible(false);
    const result = await finishCurrentRound(run, bundle);
    setFinishing(false);
    if (result.success) {
      (navigation as any).reset({
        index: 1,
        routes: [
          { name: 'PlayerHome' },
          { name: 'RoundStory', params: { runId: result.runId, summary: result.summary } },
        ],
      });
    } else {
      setFinishError(result.error);
    }
  }, [bundle, navigation, run]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading round…</Text>
      </View>
    );
  }

  if (error || !run) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="inround-error">{error ?? 'No active round'}</Text>
        <TouchableOpacity onPress={() => hydrate().catch(() => {})} testID="inround-retry">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const tee = bundle?.tees.find((t) => t.id === run.teeId);
  const teeLabel = tee?.lengthMeters ? `${tee.name} – ${tee.lengthMeters} m` : tee?.name ?? run.teeName;
  const holeScore = run ? getHoleScore(run, run.currentHole) : null;
  const scoredHoles = run ? countScoredHoles(run.scorecard) : 0;
  const isPro = plan?.plan === 'pro';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{run.courseName}</Text>
        <Text style={styles.subtitle}>{teeLabel}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} testID="hole-progress">
            Hole {run.currentHole} of {run.holes}
          </Text>
          <View
            style={[styles.watchPill, isPro ? styles.watchPillActive : styles.watchPillLocked]}
            testID="watch-hud-pill"
          >
            <Text style={[styles.watchPillText, !isPro && styles.watchPillTextLocked]}>
              {isPro ? 'Watch HUD' : 'Watch HUD (Pro)'}
            </Text>
          </View>
        </View>
        <View style={styles.holeCard}>
          <Text style={styles.holeLabel}>Par {hole?.par ?? '–'}</Text>
          <Text style={styles.holeMeta}>Index {hole?.index ?? '–'}</Text>
          <Text style={styles.holeMeta}>Length {hole?.lengthMeters ? `${hole.lengthMeters} m` : '– m'}</Text>
        </View>
        {isPro && hudStatus && <Text style={styles.hudStatus}>{hudStatus}</Text>}
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => handleAdvance(-1).catch(() => {})}
            disabled={run.currentHole <= 1}
            testID="prev-hole"
          >
            <View style={[styles.secondaryButton, run.currentHole <= 1 && styles.buttonDisabled]}>
              <Text style={styles.secondaryButtonText}>Previous hole</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAdvance(1).catch(() => {})}
            disabled={run.currentHole >= run.holes}
            testID="next-hole"
          >
            <View style={[styles.primaryButton, run.currentHole >= run.holes && styles.buttonDisabled]}>
              <Text style={styles.primaryButtonText}>Next hole</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score this hole</Text>
        <View style={styles.scoreRow}>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>Strokes</Text>
            <View style={styles.counterControls}>
              <TouchableOpacity
                onPress={() => handleScoreChange('strokes', -1).catch(() => {})}
                disabled={(holeScore?.strokes ?? 1) <= 1}
                testID="strokes-decrement"
              >
                <View
                  style={[
                    styles.circleButton,
                    (holeScore?.strokes ?? 1) <= 1 && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.circleButtonText}>-</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.counterValue} testID="strokes-value">
                {holeScore?.strokes ?? 1}
              </Text>
              <TouchableOpacity onPress={() => handleScoreChange('strokes', 1).catch(() => {})} testID="strokes-increment">
                <View style={styles.circleButton}>
                  <Text style={styles.circleButtonText}>+</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>Putts</Text>
            <View style={styles.counterControls}>
              <TouchableOpacity
                onPress={() => handleScoreChange('putts', -1).catch(() => {})}
                disabled={(holeScore?.putts ?? 0) <= 0}
                testID="putts-decrement"
              >
                <View
                  style={[
                    styles.circleButton,
                    (holeScore?.putts ?? 0) <= 0 && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.circleButtonText}>-</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.counterValue} testID="putts-value">
                {holeScore?.putts ?? 0}
              </Text>
              <TouchableOpacity onPress={() => handleScoreChange('putts', 1).catch(() => {})} testID="putts-increment">
                <View style={styles.circleButton}>
                  <Text style={styles.circleButtonText}>+</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => handleToggle('fir').catch(() => {})}
            style={[styles.toggleButton, holeScore?.fir ? styles.toggleButtonActive : null]}
            testID="fir-toggle"
          >
            <Text style={[styles.toggleText, holeScore?.fir ? styles.toggleTextActive : null]}>Hit fairway</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleToggle('gir').catch(() => {})}
            style={[styles.toggleButton, holeScore?.gir ? styles.toggleButtonActive : null]}
            testID="gir-toggle"
          >
            <Text style={[styles.toggleText, holeScore?.gir ? styles.toggleTextActive : null]}>Green in regulation</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.progressText} testID="holes-scored">
          Holes scored: {scoredHoles} / {run.holes}
        </Text>
      </View>

      {finishError && <Text style={styles.errorText}>{finishError}</Text>}

      <TouchableOpacity
        onPress={() => setConfirmVisible(true)}
        disabled={!scoredHoles || finishing}
        testID="finish-round"
      >
        <View style={[styles.primaryButton, (!scoredHoles || finishing) && styles.buttonDisabled]}>
          <Text style={styles.primaryButtonText}>{finishing ? 'Saving…' : 'Finish round'}</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={confirmVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finish round?</Text>
            <Text style={styles.modalText}>
              You’ll no longer be able to edit scores on this device for this round.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)}>
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleFinish().catch(() => {})}>
                <View style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Finish & save</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  holeCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  holeLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  holeMeta: {
    color: '#6b7280',
  },
  watchPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  watchPillActive: {
    backgroundColor: '#dcfce7',
  },
  watchPillLocked: {
    backgroundColor: '#fee2e2',
  },
  watchPillText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  watchPillTextLocked: {
    color: '#b91c1c',
  },
  hudStatus: {
    color: '#0f172a',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#111827',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  counterCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  counterLabel: {
    fontWeight: '700',
    color: '#0f172a',
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  counterValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toggleButtonActive: {
    backgroundColor: '#ecfdf3',
    borderColor: '#22c55e',
  },
  toggleText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#15803d',
  },
  progressText: {
    color: '#475569',
    marginTop: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalText: {
    color: '#475569',
  },
});
