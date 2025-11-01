import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationObject, LocationSubscription } from 'expo-location';

import { buildSnapshot } from '../../../../shared/follow/snapshot';
import { FollowStateMachine } from '../../../../shared/follow/state';
import { haversine, shouldUpdate, shortArcDiff } from '../../../../shared/follow/geo';
import type { FollowSnapshot, FollowState, GeoPoint, HoleRef } from '../../../../shared/follow/types';
import { recordFollowTick, setFollowTelemetryEmitter } from '../../../../shared/telemetry/follow';
import { WatchBridge } from '../../../../shared/watch/bridge';
import type { WatchHUDStateV1 } from '../../../../shared/watch/types';

export type UseFollowLoopOptions = {
  roundId: string;
  holes: readonly HoleRef[];
  tournamentSafe: boolean;
  playsLikePct?: number | null;
  watchAutoSend?: boolean;
  telemetryEmitter?: ((event: string, payload: Record<string, unknown>) => void) | null;
};

export type UseFollowLoopState = {
  followState: FollowState | null;
  snapshot: FollowSnapshot | null;
  gpsWeak: boolean;
  watchAutoSend: boolean;
  setWatchAutoSend: (next: boolean) => void;
  setAutoAdvance: (next: boolean) => Promise<void>;
  manualNext: () => Promise<void>;
  manualPrev: () => Promise<void>;
  recenter: () => void;
};

type HeadingSample = { value: number; ts: number };

type SendStats = { count: number; startedAt: number };

function toWatchPayload(snapshot: FollowSnapshot): WatchHUDStateV1 {
  return {
    v: 1,
    ts: snapshot.ts,
    fmb: snapshot.fmb,
    playsLikePct: snapshot.playsLikePct ?? 0,
    wind: { mps: 0, deg: snapshot.headingDeg },
    tournamentSafe: snapshot.tournamentSafe,
  };
}

export function useFollowLoop(options: UseFollowLoopOptions): UseFollowLoopState {
  const [followState, setFollowState] = useState<FollowState | null>(null);
  const [snapshot, setSnapshot] = useState<FollowSnapshot | null>(null);
  const [gpsWeak, setGpsWeak] = useState<boolean>(false);
  const [watchAutoSend, setWatchAutoSendState] = useState<boolean>(options.watchAutoSend !== false);

  const machineRef = useRef<FollowStateMachine | null>(null);
  const headingRef = useRef<HeadingSample | null>(null);
  const cadenceRef = useRef<number>(0);
  const sendStatsRef = useRef<SendStats>({ count: 0, startedAt: Date.now() });
  const lastCancelRef = useRef<boolean>(false);

  const holesMemo = useMemo(() => options.holes.slice(), [options.holes]);

  useEffect(() => {
    setFollowTelemetryEmitter(options.telemetryEmitter ?? null);
    return () => {
      setFollowTelemetryEmitter(null);
    };
  }, [options.telemetryEmitter]);

  useEffect(() => {
    let cancelled = false;
    FollowStateMachine.create({ roundId: options.roundId, holes: holesMemo }).then((machine) => {
      if (cancelled) {
        return;
      }
      machineRef.current = machine;
      setFollowState(machine.snapshot);
    });
    return () => {
      cancelled = true;
      machineRef.current = null;
      setFollowState(null);
    };
  }, [holesMemo, options.roundId]);

  const evaluateSendStats = useCallback(() => {
    const stats = sendStatsRef.current;
    const elapsedMin = Math.max(1 / 60, (Date.now() - stats.startedAt) / 60000);
    return stats.count / elapsedMin;
  }, []);

  const handlePosition = useCallback(
    async (position: LocationObject) => {
      const machine = machineRef.current;
      if (!machine) {
        return;
      }
      const now = Date.now();
      const coords = position.coords;
      const point: GeoPoint = {
        lat: coords.latitude,
        lon: coords.longitude,
        ts: typeof position.timestamp === 'number' ? position.timestamp : now,
      };
      const heading = Number.isFinite(coords.heading ?? NaN)
        ? Number(coords.heading)
        : headingRef.current?.value ?? 0;
      const prevHeading = headingRef.current;
      headingRef.current = { value: heading, ts: now };
      const deltaHeading = prevHeading ? Math.abs(shortArcDiff(heading, prevHeading.value)) : 0;
      const headingDt = prevHeading ? now - prevHeading.ts : Number.POSITIVE_INFINITY;
      const speed = Number.isFinite(coords.speed ?? NaN) ? Math.max(0, Number(coords.speed)) : 0;
      const freq = speed >= 0.7 || (headingDt <= 1000 && deltaHeading >= 8) ? 1 : 0.3;
      if (!shouldUpdate(freq, cadenceRef.current, now)) {
        return;
      }
      cadenceRef.current = now;
      const { state, autoAdvanced } = await machine.tick({
        position: point,
        headingDeg: heading,
        speedMps: speed,
        now,
      });
      setFollowState(state);
      if (!state.hole) {
        setSnapshot(null);
        return;
      }
      const distances = {
        front: haversine(point, state.hole.front),
        middle: haversine(point, state.hole.middle),
        back: haversine(point, state.hole.back),
      };
      const snapshotPayload = buildSnapshot({
        hole: state.hole,
        distances,
        headingDeg: heading,
        playsLikePct: options.playsLikePct ?? null,
        tournamentSafe: options.tournamentSafe,
        ts: now,
      });
      setSnapshot(snapshotPayload);
      if (watchAutoSend) {
        try {
          const payload = toWatchPayload(snapshotPayload);
          if (sendStatsRef.current.count === 0) {
            sendStatsRef.current.startedAt = now;
          }
          await WatchBridge.sendHUDDebounced(payload);
          sendStatsRef.current.count += 1;
        } catch {
          // ignore send failures
        }
      }
      const latencyMs = now - (point.ts ?? now);
      recordFollowTick({
        latencyMs,
        freq,
        autoAdvanceFired: autoAdvanced,
        overrideUsed: Boolean(state.overrideTs && now - state.overrideTs < 10_000),
        rpmSends: evaluateSendStats(),
        canceledQueued: lastCancelRef.current,
      });
      lastCancelRef.current = false;
    },
    [evaluateSendStats, options.playsLikePct, options.tournamentSafe, watchAutoSend],
  );

  useEffect(() => {
    let subscription: LocationSubscription | null = null;
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setGpsWeak(true);
          return;
        }
        setGpsWeak(false);
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 1,
            timeInterval: 1000,
          },
          (pos) => {
            if (!active) {
              return;
            }
            void handlePosition(pos);
          },
        );
      } catch {
        setGpsWeak(true);
      }
    })();
    return () => {
      active = false;
      if (subscription) {
        subscription.remove();
      }
      lastCancelRef.current = WatchBridge.cancelPending('follow-unmount');
    };
  }, [handlePosition]);

  useEffect(() => {
    if (!watchAutoSend) {
      lastCancelRef.current = WatchBridge.cancelPending('follow-autosend-off');
    }
  }, [watchAutoSend]);

  const setAutoAdvance = useCallback(async (next: boolean) => {
    const machine = machineRef.current;
    if (!machine) {
      return;
    }
    const updated = await machine.setAutoAdvance(next);
    setFollowState(updated);
  }, []);

  const manualNext = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine) {
      return;
    }
    const updated = await machine.manualNext();
    setFollowState(updated);
  }, []);

  const manualPrev = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine) {
      return;
    }
    const updated = await machine.manualPrev();
    setFollowState(updated);
  }, []);

  const recenter = useCallback(() => {
    headingRef.current = null;
  }, []);

  return {
    followState,
    snapshot,
    gpsWeak,
    watchAutoSend,
    setWatchAutoSend: setWatchAutoSendState,
    setAutoAdvance,
    manualNext,
    manualPrev,
    recenter,
  };
}
