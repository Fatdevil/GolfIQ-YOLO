import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { logQuickPracticeSessionComplete, logQuickPracticeSessionStart } from '@app/analytics/practiceQuick';
import { analyzeRangeShot } from '@app/api/range';
import type { RootStackParamList } from '@app/navigation/types';
import LastShotCard, { classifyDirection } from '@app/range/LastShotCard';
import type { RangeSession, RangeSessionSummary, RangeShot } from '@app/range/rangeSession';
import { getMissionById } from '@app/range/rangeMissions';
import { loadRangeMissionState } from '@app/range/rangeMissionsStorage';
import { computeTempoTargetFromHistory, type TempoTarget } from '@app/range/tempoTrainerEngine';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';
import { loadRangeHistory } from '@app/range/rangeHistoryStorage';
import { t } from '@app/i18n';
import { recordPracticeMissionOutcome } from '@app/storage/practiceMissionHistory';
import {
  isTempoTrainerAvailable,
  sendTempoTrainerActivation,
  sendTempoTrainerDeactivation,
  subscribeToTempoTrainerResults,
  type TempoTrainerResultMessage,
} from '@app/watch/tempoTrainerBridge';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSession'>;

const TEMPO_CONFIG = {
  defaultRatio: 3,
  defaultTolerance: 0.3,
  defaultBackswingMs: 900,
  defaultDownswingMs: 300,
  minSamplesForPersonal: 15,
};

function deriveWithinBand(ratio: number | null, target?: TempoTarget | null): boolean | null {
  if (ratio == null || !target) return null;
  return Math.abs(ratio - target.targetRatio) <= target.tolerance;
}

function createShot(
  session: RangeSession,
  analysis: Awaited<ReturnType<typeof analyzeRangeShot>>,
  trainerResult?: TempoTrainerResultMessage | null,
  target?: TempoTarget | null,
): RangeShot {
  const tempoRatio =
    trainerResult?.ratio != null
      ? trainerResult.ratio
      : analysis.tempoRatio != null
        ? analysis.tempoRatio
        : analysis.tempoBackswingMs && analysis.tempoDownswingMs
          ? analysis.tempoBackswingMs / analysis.tempoDownswingMs
          : null;
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
    timestamp: new Date().toISOString(),
    club: session.club,
    cameraAngle: session.cameraAngle,
    targetDistanceM: session.targetDistanceM,
    carryM: analysis.carryM ?? null,
    sideDeg: analysis.sideDeg ?? null,
    launchDeg: analysis.launchDeg ?? null,
    ballSpeedMps: analysis.ballSpeedMps ?? null,
    clubSpeedMps: analysis.clubSpeedMps ?? null,
    qualityLevel: analysis.quality?.level ?? null,
    tempoBackswingMs: trainerResult?.backswingMs ?? analysis.tempoBackswingMs ?? null,
    tempoDownswingMs: trainerResult?.downswingMs ?? analysis.tempoDownswingMs ?? null,
    tempoRatio: tempoRatio ?? null,
    tempoWithinBand: trainerResult?.withinBand ?? deriveWithinBand(tempoRatio ?? null, target),
  };
}

export default function RangeQuickPracticeSessionScreen({ navigation, route }: Props): JSX.Element {
  const session = route?.params?.session;
  const [sessionState, setSessionState] = useState<RangeSession | null>(session ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tempoTarget, setTempoTarget] = useState<TempoTarget | null>(null);
  const [isTempoTrainerEnabled, setIsTempoTrainerEnabled] = useState(false);
  const [pendingTrainerResult, setPendingTrainerResult] = useState<TempoTrainerResultMessage | null>(null);
  const practiceRecommendation = route?.params?.practiceRecommendation;
  const entrySource = route?.params?.entrySource ?? 'other';
  const hasRecommendation = Boolean(practiceRecommendation);
  const targetClubsCount = practiceRecommendation?.targetClubs?.length;
  const sessionStartedAtRef = useRef<string>(session?.startedAt ?? new Date().toISOString());
  const hasLoggedStartRef = useRef(false);
  const angleLabel = useMemo(() => {
    if (sessionState?.cameraAngle === 'down_the_line') return 'DTL';
    if (sessionState?.cameraAngle === 'face_on') return 'Face-on';
    return 'Unknown';
  }, [sessionState?.cameraAngle]);
  useEffect(() => {
    if (!sessionState) {
      navigation.replace('RangeQuickPracticeStart');
    }
  }, [navigation, sessionState]);

  useEffect(() => {
    let cancelled = false;
    const loadTarget = async () => {
      const history = await loadRangeHistory();
      if (cancelled) return;
      const target = computeTempoTargetFromHistory(
        history.map((entry) => entry.summary),
        TEMPO_CONFIG,
      );
      setTempoTarget(target);
    };
    loadTarget().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTempoTrainerEnabled) return undefined;
    const unsubscribe = subscribeToTempoTrainerResults((message) => {
      setPendingTrainerResult(message);
    });
    return unsubscribe;
  }, [isTempoTrainerEnabled]);

  useEffect(() => {
    if (hasLoggedStartRef.current) return;
    if (!sessionState) return;
    if (route?.params?.missionId) return;
    hasLoggedStartRef.current = true;
    logQuickPracticeSessionStart({
      surface: 'mobile',
      entrySource,
      hasRecommendation,
      targetClubsCount,
    });
  }, [entrySource, hasRecommendation, route?.params?.missionId, sessionState, targetClubsCount]);

  if (!sessionState) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>No active range session. Returning to Quick Practice start…</Text>
      </View>
    );
  }

  const handleLogShot = async () => {
    if (!sessionState) return;
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeRangeShot({
        club: sessionState.club,
        targetDistanceM: sessionState.targetDistanceM,
        cameraAngle: sessionState.cameraAngle,
        framesToken: null,
      });
      setSessionState((prev) => {
        if (!prev) return prev;
        const shot = createShot(prev, analysis, pendingTrainerResult, tempoTarget);
        setPendingTrainerResult(null);
        return { ...prev, shots: [...prev.shots, shot] };
      });
    } catch {
      Alert.alert('Shot not analyzed', "Couldn’t analyse that shot. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleTrainer = (value: boolean) => {
    setIsTempoTrainerEnabled(value);
    if (value) {
      if (tempoTarget) {
        sendTempoTrainerActivation(tempoTarget);
      }
    } else {
      sendTempoTrainerDeactivation();
      setPendingTrainerResult(null);
    }
  };

  const buildSummary = (
    currentSession: RangeSession,
    trainingGoalText?: string,
    mission?: { id: string; titleKey?: string },
  ): RangeSessionSummary => {
    const shotCount = currentSession.shots.length;
    const carries = currentSession.shots
      .map((s) => s.carryM)
      .filter((v): v is number => typeof v === 'number');
    const avgCarryM = carries.length ? carries.reduce((a, b) => a + b, 0) / carries.length : null;

    const sides = currentSession.shots
      .map((s) => s.sideDeg)
      .filter((v): v is number => typeof v === 'number');
    const avgSideDeg = sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : null;

    const tempoShots = currentSession.shots.filter(
      (shot) =>
        shot.tempoBackswingMs != null ||
        shot.tempoDownswingMs != null ||
        shot.tempoRatio != null,
    );
    const tempoBackswingValues = tempoShots
      .map((shot) => (typeof shot.tempoBackswingMs === 'number' ? shot.tempoBackswingMs : null))
      .filter((value): value is number => value != null && !Number.isNaN(value));
    const tempoDownswingValues = tempoShots
      .map((shot) => (typeof shot.tempoDownswingMs === 'number' ? shot.tempoDownswingMs : null))
      .filter((value): value is number => value != null && !Number.isNaN(value));
    const tempoRatioValues = tempoShots
      .map((shot) => (typeof shot.tempoRatio === 'number' ? shot.tempoRatio : null))
      .filter((value): value is number => value != null && !Number.isNaN(value));
    const tempoWithinBandCount = currentSession.shots.filter((shot) => shot.tempoWithinBand).length;

    const average = (values: number[]): number | null => {
      if (!values.length) return null;
      const total = values.reduce((a, b) => a + b, 0);
      return total / values.length;
    };

    return {
      id: currentSession.id,
      startedAt: currentSession.startedAt,
      finishedAt: new Date().toISOString(),
      club: currentSession.club,
      targetDistanceM: currentSession.targetDistanceM ?? null,
      trainingGoalText,
      missionId: mission?.id,
      missionTitleKey: mission?.titleKey,
      shotCount,
      avgCarryM,
      tendency: classifyDirection(avgSideDeg),
      avgTempoBackswingMs: average(tempoBackswingValues),
      avgTempoDownswingMs: average(tempoDownswingValues),
      avgTempoRatio: average(tempoRatioValues),
      tempoSampleCount: tempoShots.length > 0 ? tempoShots.length : null,
      tempoSwingsWithinBand: tempoWithinBandCount > 0 ? tempoWithinBandCount : null,
      minTempoRatio: tempoRatioValues.length ? Math.min(...tempoRatioValues) : null,
      maxTempoRatio: tempoRatioValues.length ? Math.max(...tempoRatioValues) : null,
    };
  };

  const handleEndSession = async () => {
    if (!sessionState) return;
    if (sessionState.shots.length === 0) {
      Alert.alert('End session?', "You haven’t logged any shots yet. End session anyway?", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => navigation.navigate('RangePractice'),
        },
      ]);
      return;
    }

    const [goal, missionState] = await Promise.all([loadCurrentTrainingGoal(), loadRangeMissionState()]);
    const missionId = route?.params?.missionId ?? missionState.pinnedMissionId;
    const mission = missionId ? getMissionById(missionId) : undefined;
    const missionMeta = missionId ? { id: missionId, titleKey: mission?.titleKey } : undefined;

    const summary = buildSummary(sessionState, goal?.text ?? undefined, missionMeta);

    if (!missionId) {
      const startedAtMs = sessionStartedAtRef.current ? Date.parse(sessionStartedAtRef.current) : NaN;
      const durationSeconds = Number.isFinite(startedAtMs)
        ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000))
        : undefined;

      logQuickPracticeSessionComplete({
        surface: 'mobile',
        entrySource,
        hasRecommendation,
        swingsCount: sessionState.shots.length,
        durationSeconds,
      });
    }

    if (practiceRecommendation) {
      const shotsForTargets = sessionState.shots.filter(
        (shot) => shot.club && practiceRecommendation.targetClubs.includes(shot.club),
      );
      const totalTargetShots = shotsForTargets.length;

      if (totalTargetShots > 0) {
        try {
          const missionOutcome = {
            missionId: practiceRecommendation.id,
            sessionId: sessionState.id,
            startedAt: sessionStartedAtRef.current,
            endedAt: new Date().toISOString(),
            targetSampleCount: practiceRecommendation.targetSampleCount,
            targetClubs: practiceRecommendation.targetClubs,
            completedSampleCount: totalTargetShots,
          };

          await recordPracticeMissionOutcome(missionOutcome);
        } catch (err) {
          console.warn('[range] Failed to persist practice mission session', err);
        }
      }
    }

    navigation.navigate('RangeQuickPracticeSummary', { summary });
  };

  const lastShot = sessionState.shots[sessionState.shots.length - 1] ?? null;
  const watchAvailable = isTempoTrainerAvailable();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick practice</Text>
        <Text style={styles.angleBadge} testID="angle-label">
          Angle: {angleLabel}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {sessionState.cameraAngle === 'down_the_line'
          ? 'Fokus: svingplan och startlinje.'
          : 'Fokus: balans och längdkontroll.'}
      </Text>

      <View style={styles.meta}>
        {sessionState.club && <Text style={styles.metaItem}>Klubba: {sessionState.club}</Text>}
        {typeof sessionState.targetDistanceM === 'number' && (
          <Text style={styles.metaItem}>Mål: {sessionState.targetDistanceM} m</Text>
        )}
      </View>

      <TouchableOpacity
        accessibilityLabel="Log shot"
        onPress={handleLogShot}
        style={styles.primaryButton}
        disabled={isAnalyzing}
        testID="log-shot"
      >
        <Text style={styles.primaryButtonText}>{isAnalyzing ? 'Analyserar…' : 'Logga slag'}</Text>
      </TouchableOpacity>

      {watchAvailable ? (
        <View style={styles.trainerCard}>
          <View style={styles.trainerHeader}>
            <Text style={styles.sectionTitle}>{t('range.tempoTrainer.title')}</Text>
            <Switch
              value={isTempoTrainerEnabled}
              onValueChange={handleToggleTrainer}
              testID="tempo-trainer-toggle"
            />
          </View>
          <Text style={styles.helperText}>{t('range.tempoTrainer.description')}</Text>
          {isTempoTrainerEnabled && tempoTarget ? (
            <Text style={styles.helperText} testID="tempo-trainer-target">
              {t('range.tempoTrainer.target_label', {
                ratio: tempoTarget.targetRatio.toFixed(1),
                backswing: tempoTarget.targetBackswingMs,
                downswing: tempoTarget.targetDownswingMs,
              })}
            </Text>
          ) : null}
        </View>
      ) : null}

      <LastShotCard
        shot={lastShot}
        targetDistanceM={sessionState.targetDistanceM}
        tempoTarget={isTempoTrainerEnabled ? tempoTarget : undefined}
      />

      <View style={styles.shotList}>
        <Text style={styles.sectionTitle}>Dina slag</Text>
        {sessionState.shots.length === 0 && <Text style={styles.emptyText}>Inga slag loggade ännu.</Text>}
        {sessionState.shots.map((shot) => (
          <View key={shot.id} style={styles.shotItem}>
            <Text style={styles.shotTitle}>Shot {shot.id.slice(0, 6)}</Text>
            <Text style={styles.shotMeta}>
              {shot.carryM != null ? `${Math.round(shot.carryM)} m carry` : 'No carry data'} ·{' '}
              {shot.sideDeg != null ? `${Math.round(shot.sideDeg)}° side` : 'No side data'}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={handleEndSession} style={styles.secondaryButton} testID="end-session">
        <Text style={styles.secondaryButtonText}>Avsluta</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
  },
  angleBadge: {
    backgroundColor: '#E0F2FE',
    color: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    fontWeight: '700',
  },
  meta: {
    gap: 4,
  },
  metaItem: {
    color: '#111827',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  trainerCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    gap: 6,
  },
  trainerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    color: '#4B5563',
  },
  shotList: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7280',
  },
  shotItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  shotTitle: {
    fontWeight: '700',
  },
  shotMeta: {
    color: '#4B5563',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackText: {
    textAlign: 'center',
    color: '#111827',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
});
