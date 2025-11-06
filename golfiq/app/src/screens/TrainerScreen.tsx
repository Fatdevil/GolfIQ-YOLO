import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { RoundRecorder } from '../../../../shared/round/recorder';
import type { RoundState, ShotEvent } from '../../../../shared/round/types';
import { bearingDeg, toLocalENU } from '../../../../shared/arhud/geo';
import { computeGolden6 } from '../../../../shared/trainer/metrics';
import { generateWeeklyPlan } from '../../../../shared/trainer/plan';
import type { GoldenMetric, GoldenSnapshot, WeeklyPlan } from '../../../../shared/trainer/types';
import { emitTrainerCameraAssistant, emitTrainerSnapshot } from '../../../../shared/telemetry/trainer';
import CameraAssistant from '../features/trainer/CameraAssistant';
import GoldenTiles from '../features/trainer/GoldenTiles';

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const SNAPSHOT_STORAGE_KEY = 'trainer.snapshots.v1';
const MAX_SNAPSHOTS = 50;
const DISTANCE_STEP = 0.5;
const MIN_DISTANCE = 1.5;
const MAX_DISTANCE = 6.5;

const fallbackStorage: AsyncStorageLike = {
  async getItem() {
    return null;
  },
  async setItem() {
    // noop fallback
  },
};

let storagePromise: Promise<AsyncStorageLike> | null = null;

function resolveTelemetryEmitter(): ((event: string, payload: Record<string, unknown>) => void) | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as { __ARHUD_QA_TELEMETRY__?: unknown };
  const candidate = holder.__ARHUD_QA_TELEMETRY__;
  return typeof candidate === 'function' ? (candidate as (event: string, payload: Record<string, unknown>) => void) : null;
}

async function getStorage(): Promise<AsyncStorageLike> {
  if (!storagePromise) {
    storagePromise = import('@react-native-async-storage/async-storage')
      .then((mod) => {
        const resolved = mod && typeof mod === 'object' && 'default' in mod ? (mod.default as AsyncStorageLike) : (mod as AsyncStorageLike);
        if (resolved && typeof resolved.getItem === 'function' && typeof resolved.setItem === 'function') {
          return resolved;
        }
        return fallbackStorage;
      })
      .catch(() => fallbackStorage);
  }
  return storagePromise;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(angleDeg: number): number {
  let normalized = ((angleDeg + 180) % 360) - 180;
  if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

function resolveClubKey(club?: string | null): string {
  if (!club) {
    return '';
  }
  return club.trim().toLowerCase();
}

function baselineLoft(club?: string | null): number {
  const key = resolveClubKey(club);
  if (!key) {
    return 24;
  }
  const map: Record<string, number> = {
    driver: 10.5,
    dr: 10.5,
    '1w': 10.5,
    '3w': 15,
    '4w': 16.5,
    '5w': 18,
    '7w': 21,
    hybrid: 22,
    '3h': 20,
    '4h': 22,
    '5h': 25,
    '2i': 18,
    '3i': 20,
    '4i': 22,
    '5i': 25,
    '6i': 28,
    '7i': 32,
    '8i': 36,
    '9i': 40,
    pw: 45,
    aw: 50,
    gw: 50,
    sw: 54,
    lw: 58,
  };
  if (map[key]) {
    return map[key];
  }
  if (/^\d+i$/.test(key)) {
    const num = Number(key.replace(/[^0-9]/g, ''));
    if (Number.isFinite(num)) {
      return 18 + (num - 3) * 4;
    }
  }
  return 24;
}

function estimateLaunchDeg(shot: ShotEvent): number | undefined {
  const baseline = baselineLoft(shot.club);
  const playsLikePct = Number.isFinite(Number(shot.playsLikePct)) ? Number(shot.playsLikePct) : null;
  if (Number.isFinite(Number(shot.carry_m))) {
    const carry = Number(shot.carry_m);
    const target = Number.isFinite(Number(shot.toPinStart_m)) ? Number(shot.toPinStart_m) : carry;
    const delta = clamp((carry - target) / 4, -8, 8);
    return clamp(baseline + delta, 5, 45);
  }
  if (playsLikePct) {
    const delta = clamp((100 - playsLikePct) / 4, -8, 8);
    return clamp(baseline + delta, 5, 45);
  }
  return undefined;
}

function estimateTempoRatio(shot: ShotEvent): number | undefined {
  const playsLikePct = Number.isFinite(Number(shot.playsLikePct)) ? Number(shot.playsLikePct) : null;
  if (!playsLikePct) {
    return undefined;
  }
  const delta = clamp((100 - playsLikePct) / 60, -0.6, 0.6);
  return 3 + delta;
}

function estimateAoaSign(shot: ShotEvent, launchDeg?: number): number | undefined {
  if (Number.isFinite(shot.carry_m) && Number.isFinite(shot.toPinStart_m)) {
    const carry = Number(shot.carry_m);
    const target = Number(shot.toPinStart_m);
    if (carry > target + 3) {
      return 1;
    }
    if (carry < target - 3) {
      return -1;
    }
  }
  if (Number.isFinite(launchDeg)) {
    return launchDeg! <= baselineLoft(shot.club) ? -1 : 1;
  }
  return undefined;
}

function buildSnapshot(round: RoundState | null, shot: ShotEvent | null): GoldenSnapshot | null {
  if (!shot || !shot.start) {
    return null;
  }
  const holeState = round?.holes?.[shot.hole] ?? null;
  const pin = holeState?.pin ?? null;
  const start = shot.start;
  const targetBearing = pin ? bearingDeg(start, pin) : undefined;
  const endPoint = shot.end ?? null;
  const headingCandidate = Number.isFinite((shot as { heading_deg?: number }).heading_deg)
    ? Number((shot as { heading_deg?: number }).heading_deg)
    : endPoint
      ? bearingDeg(start, endPoint)
      : targetBearing;
  const startDeg = targetBearing != null && headingCandidate != null
    ? normalizeAngle(headingCandidate - targetBearing)
    : undefined;
  let lateralSign: number | undefined;
  if (pin && endPoint) {
    const targetVec = toLocalENU(start, pin);
    const endVec = toLocalENU(start, endPoint);
    const cross = targetVec.x * endVec.y - targetVec.y * endVec.x;
    if (cross !== 0) {
      lateralSign = Math.sign(cross);
    }
  }
  if (!Number.isFinite(lateralSign ?? Number.NaN) && Number.isFinite(startDeg)) {
    lateralSign = Math.sign(Number(startDeg));
  }

  const launchDeg = estimateLaunchDeg(shot);
  const tempoRatio = estimateTempoRatio(shot);
  const aoaSign = estimateAoaSign(shot, launchDeg);
  const metrics = computeGolden6({
    club: shot.club,
    startDeg,
    lateralSign,
    launchDeg,
    aoaSign,
    tempoRatio,
  });
  const timestamp = Number.isFinite(Number(shot.start?.ts)) ? Number(shot.start?.ts) : Date.now();
  return {
    ts: timestamp,
    club: shot.club,
    metrics,
  };
}

const TrainerScreen: React.FC = () => {
  const [snapshots, setSnapshots] = useState<GoldenSnapshot[]>([]);
  const [metrics, setMetrics] = useState<GoldenMetric[]>([]);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [completedSessions, setCompletedSessions] = useState<Record<number, boolean>>({});
  const [distanceHint, setDistanceHint] = useState<number>(3.5);
  const telemetryRef = useRef(resolveTelemetryEmitter());

  const focusLabels = useMemo(() => plan?.focus ?? [], [plan]);

  const loadSnapshots = useCallback(async () => {
    try {
      const storage = await getStorage();
      const raw = await storage.getItem(SNAPSHOT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as GoldenSnapshot[];
      if (Array.isArray(parsed) && parsed.length) {
        const trimmed = parsed
          .filter((item) => item && typeof item.ts === 'number' && Array.isArray(item.metrics))
          .sort((a, b) => a.ts - b.ts)
          .slice(-MAX_SNAPSHOTS);
        setSnapshots(trimmed);
        setMetrics(trimmed[trimmed.length - 1]?.metrics ?? []);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    loadSnapshots().catch(() => {});
  }, [loadSnapshots]);

  useEffect(() => {
    telemetryRef.current = resolveTelemetryEmitter();
  }, []);

  useEffect(() => {
    const unsubscribe = RoundRecorder.subscribe((round, diff) => {
      if (!diff?.newShots?.length) {
        return;
      }
      const latestShot = diff.newShots[diff.newShots.length - 1];
      const snapshot = buildSnapshot(round, latestShot);
      if (!snapshot) {
        return;
      }
      setSnapshots((prev) => {
        const withoutDuplicate = prev.filter((entry) => entry.ts !== snapshot.ts);
        const next = [...withoutDuplicate, snapshot].sort((a, b) => a.ts - b.ts);
        if (next.length > MAX_SNAPSHOTS) {
          next.splice(0, next.length - MAX_SNAPSHOTS);
        }
        return next;
      });
      setMetrics(snapshot.metrics);
      emitTrainerSnapshot(telemetryRef.current, {
        club: snapshot.club,
        metrics: snapshot.metrics.map((metric) => ({
          key: metric.key,
          value: metric.value,
          quality: metric.quality,
        })),
        ts: snapshot.ts,
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!snapshots.length) {
      setPlan(null);
      return;
    }
    const nextPlan = generateWeeklyPlan(snapshots);
    setPlan(nextPlan);
    setCompletedSessions({});
    const lastSnapshot = snapshots[snapshots.length - 1];
    setMetrics(lastSnapshot.metrics);
    getStorage()
      .then((storage) => storage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots)))
      .catch(() => {});
  }, [snapshots]);

  const handleEvaluateLastShot = useCallback(async () => {
    try {
      const round = await RoundRecorder.getActiveRound();
      if (!round) {
        return;
      }
      const tailShot = (shots: ShotEvent[] | undefined): ShotEvent | null =>
        shots && shots.length ? shots[shots.length - 1] : null;
      const currentHoleId = round.currentHole;
      let holeState = round.holes?.[currentHoleId] ?? null;
      let shot: ShotEvent | null = tailShot(holeState?.shots);
      if (!shot) {
        const previousHole = currentHoleId - 1;
        holeState = previousHole >= 1 ? round.holes?.[previousHole] ?? null : null;
        shot = tailShot(holeState?.shots);
      }
      if (!shot) {
        return;
      }
      const snapshot = buildSnapshot(round, shot);
      if (!snapshot) {
        return;
      }
      setSnapshots((prev) => {
        const withoutDuplicate = prev.filter((entry) => entry.ts !== snapshot.ts);
        const next = [...withoutDuplicate, snapshot].sort((a, b) => a.ts - b.ts);
        if (next.length > MAX_SNAPSHOTS) {
          next.splice(0, next.length - MAX_SNAPSHOTS);
        }
        return next;
      });
      setMetrics(snapshot.metrics);
      emitTrainerSnapshot(telemetryRef.current, {
        club: snapshot.club,
        metrics: snapshot.metrics.map((metric) => ({ key: metric.key, value: metric.value, quality: metric.quality })),
        ts: snapshot.ts,
      });
    } catch {
      // ignore evaluation errors
    }
  }, []);

  const handleSessionToggle = useCallback((index: number) => {
    setCompletedSessions((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const handleDistanceStep = useCallback((delta: number) => {
    setDistanceHint((prev) => clamp(Number((prev + delta).toFixed(1)), MIN_DISTANCE, MAX_DISTANCE));
  }, []);

  const lastSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const lastClub = lastSnapshot?.club;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Camera Assistant</Text>
          <CameraAssistant
            club={lastClub}
            distanceMeters={distanceHint}
            onScoreChange={(score, detail) => {
              emitTrainerCameraAssistant(telemetryRef.current, {
                levelDeg: detail.level.rollDeg,
                framingHint: detail.framing.label,
                score,
                club: lastClub,
              });
            }}
          />
        </View>
        <View style={styles.distanceRow}>
          <Text style={styles.distanceLabel}>Distance hint</Text>
          <View style={styles.distanceControls}>
            <TouchableOpacity style={styles.distanceButton} onPress={() => handleDistanceStep(-DISTANCE_STEP)}>
              <Text style={styles.distanceButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.distanceValue}>{distanceHint.toFixed(1)} m</Text>
            <TouchableOpacity style={styles.distanceButton} onPress={() => handleDistanceStep(DISTANCE_STEP)}>
              <Text style={styles.distanceButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Golden-6 snapshot</Text>
          {lastClub ? <Text style={styles.clubLabel}>{lastClub}</Text> : null}
        </View>
        {metrics.length ? <GoldenTiles metrics={metrics} /> : <Text style={styles.placeholder}>Record a swing to populate the Golden-6 metrics.</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={handleEvaluateLastShot} accessibilityRole="button">
          <Text style={styles.primaryButtonLabel}>Evaluate last shot</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly plan</Text>
        {focusLabels.length ? (
          <Text style={styles.focusLine}>Focus: {focusLabels.map((key) => key.replace(/([A-Z])/g, ' $1')).join(' · ')}</Text>
        ) : (
          <Text style={styles.placeholder}>Track a few swings to generate your focus plan.</Text>
        )}
        {plan?.sessions?.map((session, index) => (
          <TouchableOpacity
            key={session.title}
            style={[styles.sessionCard, completedSessions[index] ? styles.sessionCardDone : null]}
            onPress={() => handleSessionToggle(index)}
            accessibilityRole="button"
          >
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>{session.title}</Text>
              {completedSessions[index] ? <Text style={styles.sessionDone}>Done</Text> : null}
            </View>
            <View style={styles.sessionBlock}>
              <Text style={styles.sessionLabel}>Drills</Text>
              {session.drills.map((drill) => (
                <Text key={drill} style={styles.sessionItem}>
                  • {drill}
                </Text>
              ))}
            </View>
            <View style={styles.sessionBlock}>
              <Text style={styles.sessionLabel}>Target notes</Text>
              {session.targetNotes.map((note) => (
                <Text key={note} style={styles.sessionItem}>
                  • {note}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 20,
  },
  section: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  clubLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distanceLabel: {
    color: '#cbd5f5',
    fontSize: 13,
    fontWeight: '600',
  },
  distanceControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  distanceButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceButtonText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  distanceValue: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  placeholder: {
    color: '#64748b',
    fontSize: 13,
  },
  focusLine: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sessionCard: {
    backgroundColor: '#0b1120',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 8,
  },
  sessionCardDone: {
    borderColor: '#22c55e',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  sessionDone: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionBlock: {
    gap: 4,
  },
  sessionLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionItem: {
    color: '#e2e8f0',
    fontSize: 13,
  },
});

export default TrainerScreen;
