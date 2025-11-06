import { RoundRecorder } from '../../../../shared/round/recorder';
import { getActiveRound } from '../../../../shared/round/round_store';
import type { Lie, ShotEvent, RoundState } from '../../../../shared/round/types';
import { appendHoleAccuracy, computeConfusion } from '../../../../shared/telemetry/shotsenseMetrics';
import { recordAutoReconcile } from '../../../../shared/telemetry/round';
import { autoQueue, type AcceptedAutoShot } from './AutoCaptureQueue';
import { pushHoleScore } from '../../../../shared/events/service';
import { computeRoundRevision, computeScoresHash } from '../../../../shared/events/revision';
import { computeNetForRound } from '../../../../shared/events/net';
import { getEventContext } from '../../../../shared/events/state';
import { recordScoreFailed, recordScoreUpserted } from '../../../../shared/events/telemetry';

declare const __DEV__: boolean | undefined;

type RoundRecorderLike = Pick<typeof RoundRecorder, 'addShot'>;

type CandidateShot = AcceptedAutoShot;

type ReviewPick = {
  id: string;
  accept: boolean;
  club?: string;
};

type ReviewAndApplyArgs = {
  holeId: number;
  picks?: ReviewPick[];
};

type Summary = { applied: number; rejected: number };

type SanitizedStart = { lat: number; lon: number; ts: number };

type PickMap = Map<string, ReviewPick>;

let recorder: RoundRecorderLike = RoundRecorder;

function sanitizeClub(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeLie(lie: CandidateShot['lie']): Lie {
  if (typeof lie !== 'string') {
    return 'Fairway';
  }
  const normalized = lie.trim().toLowerCase();
  switch (normalized) {
    case 'tee':
      return 'Tee';
    case 'rough':
      return 'Rough';
    case 'sand':
      return 'Sand';
    case 'recovery':
      return 'Recovery';
    case 'green':
      return 'Green';
    case 'penalty':
      return 'Penalty';
    default:
      return 'Fairway';
  }
}

function sanitizeStart(shot: CandidateShot): SanitizedStart | null {
  if (!shot.start) {
    return null;
  }
  const lat = Number(shot.start.lat);
  const lon = Number(shot.start.lon);
  const tsCandidate = Number.isFinite(Number(shot.start.ts)) ? Number(shot.start.ts) : Number(shot.ts);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const ts = Number.isFinite(tsCandidate) ? Math.max(0, Math.floor(tsCandidate)) : Date.now();
  return { lat, lon, ts };
}

function buildPickMap(picks?: ReviewPick[] | null): PickMap {
  const map: PickMap = new Map();
  if (!picks || !picks.length) {
    return map;
  }
  for (const pick of picks) {
    if (!pick || typeof pick.id !== 'string') {
      continue;
    }
    const id = pick.id.trim();
    if (!id) {
      continue;
    }
    map.set(id, pick);
  }
  return map;
}

function buildAutoEvents(autoShots: CandidateShot[]): ShotEvent[] {
  return autoShots
    .map((shot, index) => {
      const start = sanitizeStart(shot);
      if (!start) {
        return null;
      }
      const playsLike = Number.isFinite(Number(shot.playsLikePct)) ? Number(shot.playsLikePct) : undefined;
      return {
        id: shot.id,
        hole: shot.holeId,
        seq: index + 1,
        kind: 'Full',
        start,
        startLie: sanitizeLie(shot.lie),
        source: shot.source,
        club: sanitizeClub(shot.club),
        playsLikePct: playsLike,
      } as ShotEvent;
    })
    .filter((shot): shot is ShotEvent => Boolean(shot));
}

function defaultAcceptState(picks?: ReviewPick[] | null): boolean {
  if (!picks) {
    return true;
  }
  return picks.length === 0;
}

export function collectAutoCandidates(holeId: number): CandidateShot[] {
  if (!Number.isFinite(holeId)) {
    return [];
  }
  const normalized = Math.floor(Number(holeId));
  if (normalized <= 0) {
    return [];
  }
  return autoQueue.getAcceptedShots(normalized).map((shot) => ({
    ...shot,
    start: shot.start ? { ...shot.start } : undefined,
  }));
}

async function applyShotCandidate(shot: CandidateShot, club: string | undefined): Promise<boolean> {
  const start = sanitizeStart(shot);
  if (!start) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] Missing start for auto shot', shot);
    }
    return false;
  }
  try {
    await recorder.addShot(shot.holeId, {
      kind: 'Full',
      start,
      startLie: sanitizeLie(shot.lie),
      club,
      source: shot.source,
      playsLikePct: Number.isFinite(Number(shot.playsLikePct)) ? Number(shot.playsLikePct) : undefined,
    });
    return true;
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] Failed to record auto shot', error);
    }
    return false;
  }
}

async function recordHoleAccuracy(
  roundId: string | null,
  holeId: number,
  autoShots: CandidateShot[],
): Promise<void> {
  if (!autoShots.length) {
    return;
  }
  if (typeof RoundRecorder.getHoleShots !== 'function') {
    return;
  }
  try {
    const snapshot = await RoundRecorder.getHoleShots(holeId);
    const autoEvents = buildAutoEvents(autoShots);
    if (!autoEvents.length) {
      return;
    }
    const confusion = computeConfusion(autoEvents, snapshot.shots);
    if (roundId) {
      appendHoleAccuracy(roundId, snapshot.holeId ?? holeId, confusion);
    }
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] failed to capture ShotSense accuracy', error);
    }
  }
}

export const PostHoleReconciler = {
  async reviewAndApply({ holeId, picks }: ReviewAndApplyArgs): Promise<Summary> {
    if (!Number.isFinite(holeId)) {
      return { applied: 0, rejected: 0 };
    }
    try {
      const candidates = collectAutoCandidates(holeId);
      if (!candidates.length) {
        return { applied: 0, rejected: 0 };
      }
      const map = buildPickMap(picks);
      const assumeAccept = defaultAcceptState(picks);
      let applied = 0;
      let rejected = 0;
      let finalizedCount = 0;
      for (const shot of candidates) {
        const pick = map.get(shot.id);
        const accept = pick ? pick.accept === true : assumeAccept;
        const club = sanitizeClub(pick?.club ?? shot.club);
        if (!accept) {
          autoQueue.finalizeShot(shot.holeId, shot.id);
          rejected += 1;
          finalizedCount += 1;
          continue;
        }
        const outcome = await applyShotCandidate({ ...shot, club }, club);
        if (outcome) {
          autoQueue.finalizeShot(shot.holeId, shot.id);
          applied += 1;
          finalizedCount += 1;
        } else {
          rejected += 1;
        }
      }
      const queueWithPending = autoQueue as typeof autoQueue & {
        getPendingShots?: (id: number) => CandidateShot[];
      };
      const pending = typeof queueWithPending.getPendingShots === 'function'
        ? queueWithPending.getPendingShots(holeId).length
        : null;
      const allFinalized = finalizedCount === candidates.length;
      if (pending !== null ? pending === 0 : allFinalized) {
        autoQueue.finalizeHole(holeId);
      }

      let roundId: string | null = null;
      let roundState: RoundState | null = null;
      if (typeof RoundRecorder.getActiveRound === 'function') {
        try {
          const round = await RoundRecorder.getActiveRound();
          if (round && typeof round.id === 'string') {
            roundId = round.id;
            roundState = round;
          }
        } catch {
          roundId = null;
        }
      }

      await recordHoleAccuracy(roundId, holeId, candidates);
      if (roundId) {
        recordAutoReconcile({
          roundId,
          hole: Math.max(0, Math.floor(holeId)),
          applied,
          rejected,
        });
        if (applied > 0) {
          const context = getEventContext();
          const participant = context?.participant ?? null;
          const activeEvent = context?.event ?? null;
          const attachedRoundId = participant?.round_id ?? null;
          const holeNumber = Math.max(1, Math.floor(holeId));
          const holeState = roundState?.holes?.[holeNumber] ?? null;
          const gross =
            typeof holeState?.strokes === 'number'
              ? Math.max(0, holeState.strokes)
              : Math.max(0, holeState?.shots?.length ?? 0);
          if (activeEvent && participant && attachedRoundId === roundId && gross > 0) {
            try {
              const roundRevision = computeRoundRevision(roundState ?? null);
              const scoresHash = computeScoresHash(roundState ?? null);
              const qaRound = getActiveRound();
              const handicapSetup = qaRound?.handicapSetup;
              const parValue = Math.max(3, Math.min(6, Math.floor(holeState?.par ?? 4)));
              let netScore: number | null = null;
              let stablefordPoints: number | null = null;
              let strokesReceived: number | null = null;
              let courseHandicap: number | null = null;
              let playingHandicap: number | null = null;
              if (handicapSetup) {
                const holesForNet = (qaRound?.holes ?? []).map((hole) => ({
                  hole: hole.holeNo,
                  par: hole.par,
                  gross: Number.isFinite(hole.score) ? Number(hole.score) : hole.par,
                }));
                const targetIndex = holesForNet.findIndex((hole) => hole.hole === holeNumber);
                if (targetIndex >= 0) {
                  holesForNet[targetIndex] = {
                    hole: holeNumber,
                    par: holesForNet[targetIndex].par,
                    gross,
                  };
                } else {
                  holesForNet.push({ hole: holeNumber, par: parValue, gross });
                }
                holesForNet.sort((a, b) => a.hole - b.hole);
                const netResult = computeNetForRound(handicapSetup, holesForNet);
                const holeEntry = netResult.holes.find((entry) => entry.hole === holeNumber);
                if (holeEntry) {
                  netScore = holeEntry.net;
                  stablefordPoints = holeEntry.points;
                }
                const holePos = Math.max(0, Math.min(netResult.strokesPerHole.length - 1, holeNumber - 1));
                strokesReceived = netResult.strokesPerHole[holePos] ?? null;
                courseHandicap = netResult.courseHandicap;
                playingHandicap = netResult.playingHandicap;
              }
              await pushHoleScore({
                eventId: activeEvent.id,
                roundId,
                hole: holeNumber,
                gross,
                par: parValue,
                net: netScore ?? undefined,
                stableford: stablefordPoints ?? undefined,
                strokesReceived: strokesReceived ?? undefined,
                courseHandicap: courseHandicap ?? undefined,
                playingHandicap: playingHandicap ?? undefined,
                hcpIndex: participant.hcp_index ?? null,
                roundRevision,
                scoresHash,
              });
              recordScoreUpserted(activeEvent.id, participant.user_id, holeNumber, gross);
            } catch (pushError) {
              console.warn('[PostHoleReconciler] pushHoleScore failed', pushError);
              recordScoreFailed(activeEvent.id, roundId, pushError);
            }
          }
        }
      }
      return { applied, rejected };
    } catch (error) {
      console.warn('[PostHoleReconciler] reviewAndApply failed', error);
      return { applied: 0, rejected: 0 };
    }
  },
};

export type PostHoleReconcilerType = typeof PostHoleReconciler;

export async function reconcileIfPending(holeId: number): Promise<number> {
  const { applied } = await PostHoleReconciler.reviewAndApply({ holeId });
  return applied;
}

export function __setRoundRecorderForTest(next: RoundRecorderLike | null): void {
  recorder = next ?? RoundRecorder;
}
