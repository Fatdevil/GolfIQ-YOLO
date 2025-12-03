import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { analyzeRangeShot } from '@app/api/range';
import type { RootStackParamList } from '@app/navigation/types';
import LastShotCard, { classifyDirection } from '@app/range/LastShotCard';
import type { RangeSession, RangeSessionSummary, RangeShot } from '@app/range/rangeSession';
import { getMissionById } from '@app/range/rangeMissions';
import { loadRangeMissionState } from '@app/range/rangeMissionsStorage';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSession'>;

function createShot(session: RangeSession, analysis: Awaited<ReturnType<typeof analyzeRangeShot>>): RangeShot {
  const tempoRatio =
    analysis.tempoRatio != null
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
    tempoBackswingMs: analysis.tempoBackswingMs ?? null,
    tempoDownswingMs: analysis.tempoDownswingMs ?? null,
    tempoRatio: tempoRatio ?? null,
  };
}

export default function RangeQuickPracticeSessionScreen({ navigation, route }: Props): JSX.Element {
  const session = route?.params?.session;
  const [sessionState, setSessionState] = useState<RangeSession | null>(session ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
      setSessionState((prev) => (prev ? { ...prev, shots: [...prev.shots, createShot(prev, analysis)] } : prev));
    } catch {
      Alert.alert('Shot not analyzed', "Couldn’t analyse that shot. Please try again.");
    } finally {
      setIsAnalyzing(false);
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
    navigation.navigate('RangeQuickPracticeSummary', { summary });
  };

  const lastShot = sessionState.shots[sessionState.shots.length - 1] ?? null;

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

      <LastShotCard shot={lastShot} targetDistanceM={sessionState.targetDistanceM} />

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
