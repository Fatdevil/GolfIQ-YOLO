import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationObject, LocationSubscription } from 'expo-location';

import { buildSnapshot } from '../../../../shared/follow/snapshot';
import { FollowStateMachine } from '../../../../shared/follow/state';
import { haversine, shouldUpdate, shortArcDiff } from '../../../../shared/follow/geo';
import type { FollowSnapshot, FollowState, GeoPoint, HoleRef } from '../../../../shared/follow/types';
import { stepAutoV2, type AutoInput, type AutoState } from '../../../../shared/follow/auto';
import { RoundRecorder } from '../../../../shared/round/recorder';
import {
  recordAutoEvent,
  recordFollowTick,
  recordHoleSnap,
  setFollowTelemetryEmitter,
} from '../../../../shared/telemetry/follow';
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
  autoMode: 'v1' | 'v2';
  setAutoMode: (mode: 'v1' | 'v2') => Promise<void>;
  manualNext: () => Promise<void>;
  manualPrev: () => Promise<void>;
  recenter: () => void;
};

type HeadingSample = { value: number; ts: number };

type SendStats = { count: number; startedAt: number };

type MaybeGeo = { lat?: number | null; lon?: number | null } | null | undefined;

const toLatLon = (point: MaybeGeo): { lat: number; lon: number } | null => {
  if (!point) {
    return null;
  }
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
};

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
  const autoStateRef = useRef<AutoState | null>(null);
  const autoModeRef = useRef<'v1' | 'v2'>('v2');
  const [autoMode, setAutoModeState] = useState<'v1' | 'v2'>('v2');
  const autoEnabledRef = useRef<boolean>(true);

  const holesMemo = useMemo(() => options.holes.slice(), [options.holes]);

  const resolveHoleNumber = useCallback((hole: HoleRef | null): number | null => {
    if (!hole) {
      return null;
    }
    if (Number.isFinite(hole.number)) {
      return Number(hole.number);
    }
    if (typeof hole.id === 'string') {
      const parsed = Number.parseInt(hole.id.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }, []);

  const toAutoHole = useCallback(
    (hole: HoleRef | null): AutoInput['hole'] | null => {
      if (!hole) {
        return null;
      }
      const holeNumber = resolveHoleNumber(hole);
      if (holeNumber === null) {
        return null;
      }
      const greenMid = toLatLon(hole.middle);
      if (!greenMid) {
        return null;
      }
      const holeWithTee = hole as HoleRef & { tee?: MaybeGeo };
      const teePoint = toLatLon(holeWithTee.tee);
      const autoHole: AutoInput['hole'] = {
        id: holeNumber,
        par: 4,
        green: {
          mid: greenMid,
          radius_m: 20,
        },
      } satisfies AutoInput['hole'];
      if (teePoint) {
        autoHole.tee = teePoint;
      }
      return autoHole;
    },
    [resolveHoleNumber],
  );

  const toAutoNeighbor = useCallback(
    (hole: HoleRef | null): AutoInput['next'] | null => {
      const base = toAutoHole(hole);
      if (!base) {
        return null;
      }
      const neighbor: NonNullable<AutoInput['next']> = {
        id: base.id,
        green: base.green,
      } satisfies NonNullable<AutoInput['next']>;
      if (base.tee) {
        neighbor.tee = base.tee;
      }
      return neighbor;
    },
    [toAutoHole],
  );

  const patchFollowState = useCallback(
    (state: FollowState): FollowState => {
      if (autoModeRef.current === 'v2') {
        return { ...state, autoAdvanceEnabled: autoEnabledRef.current };
      }
      return state;
    },
    [],
  );

  const runAutoStep = useCallback(
    async (
      current: FollowState,
      point: GeoPoint,
      headingDeg: number | null,
      speed: number,
      now: number,
    ): Promise<FollowState> => {
      const machine = machineRef.current;
      if (!machine) {
        return current;
      }
      const autoHole = toAutoHole(current.hole);
      if (!autoHole) {
        autoStateRef.current = null;
        return current;
      }
      const index = Number.isFinite(current.holeIndex) ? Number(current.holeIndex) : -1;
      const nextRef = index >= 0 ? holesMemo[index + 1] ?? null : null;
      const prevRef = index >= 0 ? holesMemo[index - 1] ?? null : null;
      const autoInput: AutoInput = {
        pos: {
          lat: Number(point.lat),
          lon: Number(point.lon),
          ts: Number.isFinite(point.ts ?? NaN) ? Number(point.ts) : now,
          speed_mps: speed,
          headingDeg: headingDeg ?? undefined,
        },
        hole: autoHole,
      };
      const nextNeighbor = toAutoNeighbor(nextRef);
      if (nextNeighbor) {
        autoInput.next = nextNeighbor;
      }
      const prevNeighbor = toAutoNeighbor(prevRef);
      if (prevNeighbor) {
        autoInput.prev = prevNeighbor;
      }

      let base = autoStateRef.current;
      if (!base) {
        base = { stableHoleId: autoHole.id, atTeeBox: null };
      } else {
        const valid = new Set<number>([autoHole.id]);
        if (nextNeighbor) {
          valid.add(nextNeighbor.id);
        }
        if (prevNeighbor) {
          valid.add(prevNeighbor.id);
        }
        if (!valid.has(base.stableHoleId)) {
          base = { stableHoleId: autoHole.id, atTeeBox: null };
        }
      }

      const nextState = stepAutoV2(base, autoInput);
      autoStateRef.current = nextState;

      if (!base.reachedGreenAt && nextState.reachedGreenAt) {
        recordHoleSnap({ holeId: autoHole.id, kind: 'green' });
      }
      const nextTeeLock = nextState.atTeeBox?.holeId ?? null;
      if (nextTeeLock && nextTeeLock !== base.atTeeBox?.holeId) {
        recordHoleSnap({ holeId: nextTeeLock, kind: 'tee' });
      }

      let followResult = current;
      const prevStable = base.stableHoleId;
      const targetStable = nextState.stableHoleId;
      if (targetStable !== prevStable) {
        const reason = nextTeeLock === targetStable ? 'teeLock' : 'leaveGreen';
        if (nextNeighbor && targetStable === nextNeighbor.id) {
          recordAutoEvent({ from: prevStable, to: targetStable, reason });
          await RoundRecorder.nextHole();
          const updated = await machine.manualNext(now);
          autoStateRef.current = { stableHoleId: targetStable, atTeeBox: nextState.atTeeBox ?? null };
          followResult = updated;
        } else if (prevNeighbor && targetStable === prevNeighbor.id) {
          recordAutoEvent({ from: prevStable, to: targetStable, reason });
          await RoundRecorder.prevHole();
          const updated = await machine.manualPrev(now);
          autoStateRef.current = { stableHoleId: targetStable, atTeeBox: nextState.atTeeBox ?? null };
          followResult = updated;
        }
      }

      return followResult;
    },
    [holesMemo, toAutoHole, toAutoNeighbor],
  );

  useEffect(() => {
    setFollowTelemetryEmitter(options.telemetryEmitter ?? null);
    return () => {
      setFollowTelemetryEmitter(null);
    };
  }, [options.telemetryEmitter]);

  useEffect(() => {
    let cancelled = false;
    const autoAdvanceEnabled = autoModeRef.current === 'v2' ? false : undefined;
    FollowStateMachine.create({ roundId: options.roundId, holes: holesMemo, autoAdvanceEnabled }).then((machine) => {
      if (cancelled) {
        return;
      }
      machineRef.current = machine;
      const snapshot = machine.snapshot;
      autoEnabledRef.current = snapshot.autoAdvanceEnabled !== false;
      if (autoModeRef.current === 'v2') {
        void machine.setAutoAdvance(false);
      }
      setFollowState(patchFollowState(snapshot));
      const currentHoleNumber = resolveHoleNumber(snapshot.hole);
      autoStateRef.current = currentHoleNumber ? { stableHoleId: currentHoleNumber, atTeeBox: null } : null;
    });
    return () => {
      cancelled = true;
      machineRef.current = null;
      setFollowState(null);
      autoStateRef.current = null;
    };
  }, [holesMemo, options.roundId, patchFollowState, resolveHoleNumber]);

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
      const { state: machineState, autoAdvanced } = await machine.tick({
        position: point,
        headingDeg: heading,
        speedMps: speed,
        now,
      });
      let follow = machineState;
      let autoAdvancedV2 = false;
      if (autoModeRef.current === 'v2') {
        if (autoEnabledRef.current) {
          const beforeHoleNumber = resolveHoleNumber(follow.hole);
          follow = await runAutoStep(
            follow,
            point,
            Number.isFinite(heading) ? heading : null,
            speed,
            now,
          );
          const afterHoleNumber = resolveHoleNumber(follow.hole);
          autoAdvancedV2 = Boolean(
            beforeHoleNumber !== null && afterHoleNumber !== null && beforeHoleNumber !== afterHoleNumber,
          );
        } else {
          const currentHoleNumber = resolveHoleNumber(follow.hole);
          autoStateRef.current = currentHoleNumber ? { stableHoleId: currentHoleNumber, atTeeBox: null } : null;
        }
      } else {
        autoStateRef.current = null;
      }
      const patchedFollow = patchFollowState(follow);
      setFollowState(patchedFollow);
      if (!patchedFollow.hole) {
        setSnapshot(null);
        return;
      }
      const distances = {
        front: haversine(point, patchedFollow.hole.front),
        middle: haversine(point, patchedFollow.hole.middle),
        back: haversine(point, patchedFollow.hole.back),
      };
      const snapshotPayload = buildSnapshot({
        hole: patchedFollow.hole,
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
        autoAdvanceFired: autoAdvanced || autoAdvancedV2,
        overrideUsed: Boolean(patchedFollow.overrideTs && now - patchedFollow.overrideTs < 10_000),
        rpmSends: evaluateSendStats(),
        canceledQueued: lastCancelRef.current,
      });
      lastCancelRef.current = false;
    },
    [
      evaluateSendStats,
      options.playsLikePct,
      options.tournamentSafe,
      watchAutoSend,
      runAutoStep,
      patchFollowState,
      resolveHoleNumber,
    ],
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

  const setAutoAdvance = useCallback(
    async (next: boolean) => {
      autoEnabledRef.current = next;
      const machine = machineRef.current;
      if (!machine) {
        setFollowState((prev) => (prev ? { ...prev, autoAdvanceEnabled: next } : prev));
        return;
      }
      if (autoModeRef.current === 'v1') {
        const updated = await machine.setAutoAdvance(next);
        setFollowState(patchFollowState(updated));
      } else {
        await machine.setAutoAdvance(false);
        setFollowState((prev) => (prev ? { ...prev, autoAdvanceEnabled: next } : prev));
      }
    },
    [patchFollowState],
  );

  const manualNext = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine) {
      return;
    }
    const before = machine.snapshot;
    const beforeHole = resolveHoleNumber(before.hole);
    await RoundRecorder.nextHole();
    const updated = await machine.manualNext();
    const patched = patchFollowState(updated);
    setFollowState(patched);
    const afterHole = resolveHoleNumber(updated.hole);
    if (beforeHole !== null && afterHole !== null && beforeHole !== afterHole) {
      recordAutoEvent({ from: beforeHole, to: afterHole, reason: 'manual' });
    }
    autoStateRef.current = afterHole ? { stableHoleId: afterHole, atTeeBox: null } : null;
  }, [patchFollowState, resolveHoleNumber]);

  const manualPrev = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine) {
      return;
    }
    const before = machine.snapshot;
    const beforeHole = resolveHoleNumber(before.hole);
    await RoundRecorder.prevHole();
    const updated = await machine.manualPrev();
    const patched = patchFollowState(updated);
    setFollowState(patched);
    const afterHole = resolveHoleNumber(updated.hole);
    if (beforeHole !== null && afterHole !== null && beforeHole !== afterHole) {
      recordAutoEvent({ from: beforeHole, to: afterHole, reason: 'manual' });
    }
    autoStateRef.current = afterHole ? { stableHoleId: afterHole, atTeeBox: null } : null;
  }, [patchFollowState, resolveHoleNumber]);

  const setAutoMode = useCallback(
    async (mode: 'v1' | 'v2') => {
      if (mode === autoModeRef.current) {
        return;
      }
      autoModeRef.current = mode;
      setAutoModeState(mode);
      const machine = machineRef.current;
      if (!machine) {
        return;
      }
      if (mode === 'v1') {
        const updated = await machine.setAutoAdvance(autoEnabledRef.current);
        setFollowState(patchFollowState(updated));
        autoStateRef.current = null;
      } else {
        await machine.setAutoAdvance(false);
        setFollowState((prev) => {
          if (!prev) {
            return prev;
          }
          return { ...prev, autoAdvanceEnabled: autoEnabledRef.current };
        });
        const holeNumber = resolveHoleNumber(machine.snapshot.hole);
        autoStateRef.current = holeNumber ? { stableHoleId: holeNumber, atTeeBox: null } : null;
      }
    },
    [patchFollowState, resolveHoleNumber],
  );

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
    autoMode,
    setAutoMode,
    manualNext,
    manualPrev,
    recenter,
  };
}
