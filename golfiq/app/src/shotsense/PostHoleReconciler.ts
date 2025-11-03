import { RoundRecorder } from '../../../../shared/round/recorder';
import { appendHoleAccuracy, computeConfusion } from '../../../../shared/telemetry/shotsenseMetrics';
import { autoQueue, type AcceptedAutoShot } from './AutoCaptureQueue';

type RoundRecorderLike = Pick<typeof RoundRecorder, 'addShot'>;

let recorder: RoundRecorderLike = RoundRecorder;

type ReviewDecision = {
  id: string;
  accepted?: boolean;
  club?: string | null;
  playsLikePct?: number | null;
};

type ReviewAndApplyArgs = {
  holeId: number;
  decisions?: ReviewDecision[];
};

type AlertLike = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{ text?: string; style?: string; onPress?: (() => void) | undefined }> | undefined,
    options?: { cancelable?: boolean; onDismiss?: (() => void) | undefined },
  ) => void;
};

let cachedAlert: AlertLike | null | undefined;
type ConfirmHandler = (holeId: number, shots: AcceptedAutoShot[]) => Promise<boolean>;

async function ensureAlert(): Promise<AlertLike | null> {
  if (cachedAlert !== undefined) {
    return cachedAlert;
  }
  try {
    const mod = await import('react-native');
    const candidate = (mod as { Alert?: AlertLike }).Alert;
    cachedAlert = candidate && typeof candidate.alert === 'function' ? candidate : null;
  } catch (error) {
    cachedAlert = null;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] Alert unavailable', error);
    }
  }
  return cachedAlert ?? null;
}

function formatPreview(shots: AcceptedAutoShot[]): string {
  const clubs = shots
    .map((shot) => shot.club?.trim())
    .filter((club): club is string => Boolean(club));
  if (!clubs.length) {
    return '';
  }
  const preview = clubs.slice(0, 2).join(', ');
  const suffix = clubs.length > 2 ? ', …' : '';
  return ` (${preview}${suffix})`;
}

async function confirmWithAlert(holeId: number, shots: AcceptedAutoShot[]): Promise<boolean> {
  const alert = await ensureAlert();
  if (!alert) {
    return false;
  }
  return new Promise((resolve) => {
    alert.alert(
      'Auto-shots detected',
      `Apply ${shots.length} shot${shots.length === 1 ? '' : 's'} to Hole ${holeId}?${formatPreview(shots)}`,
      [
        {
          text: 'Skip',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Apply',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      },
    );
  });
}

type NormalizedDecision = {
  accepted: boolean;
  club?: string;
  playsLikePct?: number;
};

type ApplyOutcome = 'applied' | 'missing-start' | 'failed';

function buildDecisionMap(decisions?: ReviewDecision[] | null): Map<string, NormalizedDecision> {
  const map = new Map<string, NormalizedDecision>();
  if (!decisions || !decisions.length) {
    return map;
  }
  for (const decision of decisions) {
    if (!decision || typeof decision.id !== 'string' || !decision.id.trim()) {
      continue;
    }
    const normalizedId = decision.id.trim();
    const accepted = decision.accepted !== false;
    const club = typeof decision.club === 'string' && decision.club.trim() ? decision.club.trim() : undefined;
    const playsLike = Number(decision.playsLikePct);
    map.set(normalizedId, {
      accepted,
      club,
      playsLikePct: Number.isFinite(playsLike) ? playsLike : undefined,
    });
  }
  return map;
}

async function applyShot(shot: AcceptedAutoShot): Promise<ApplyOutcome> {
  const start = shot.start;
  if (!start) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] Missing start for auto shot', shot);
    }
    autoQueue.finalizeShot(shot.holeId, shot.id);
    return 'missing-start';
  }
  const lie = shot.lie ?? 'Fairway';
  try {
    await recorder.addShot(shot.holeId, {
      kind: 'Full',
      start,
      startLie: lie,
      source: shot.source,
      club: shot.club,
      playsLikePct: Number.isFinite(Number(shot.playsLikePct)) ? Number(shot.playsLikePct) : undefined,
    });
    autoQueue.finalizeShot(shot.holeId, shot.id);
    return 'applied';
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] Failed to record auto shot', error);
    }
    return 'failed';
  }
}

async function applyReviewedShots(
  shots: AcceptedAutoShot[],
  decisions: Map<string, NormalizedDecision>,
): Promise<{ applied: number; rejected: number }> {
  let applied = 0;
  let rejected = 0;
  for (const shot of shots) {
    const decision = decisions.get(shot.id);
    const accepted = decision ? decision.accepted : true;
    const normalized: AcceptedAutoShot = {
      ...shot,
      club: decision?.club ?? shot.club,
      playsLikePct: decision?.playsLikePct ?? shot.playsLikePct,
    };
    if (!accepted) {
      autoQueue.finalizeShot(normalized.holeId, normalized.id);
      rejected += 1;
      continue;
    }
    const outcome = await applyShot(normalized);
    if (outcome === 'applied') {
      applied += 1;
    } else if (outcome === 'missing-start') {
      rejected += 1;
    }
  }
  return { applied, rejected };
}

let confirmHandler: ConfirmHandler = confirmWithAlert;

async function recordHoleAccuracy(holeId: number, autoShots: AcceptedAutoShot[]): Promise<void> {
  if (!autoShots.length) {
    return;
  }
  if (typeof RoundRecorder.getHoleShots !== 'function') {
    return;
  }
  try {
    const snapshot = await RoundRecorder.getHoleShots(holeId);
    const recorded = snapshot.shots.map((shot) => ({ ts: shot.start?.ts ?? Number.NaN, source: shot.source }));
    const confusion = computeConfusion(
      autoShots.map((shot) => ({ ts: shot.ts })),
      recorded,
    );
    appendHoleAccuracy(holeId, {
      holeIndex: snapshot.holeIndex,
      timestamp: Date.now(),
      ...confusion,
    });
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PostHoleReconciler] failed to capture ShotSense accuracy', error);
    }
  }
}

export const PostHoleReconciler = {
  async reviewAndApply({ holeId, decisions }: ReviewAndApplyArgs): Promise<{ applied: number; rejected: number }> {
    if (!Number.isFinite(holeId)) {
      return { applied: 0, rejected: 0 };
    }
    try {
      const shots = autoQueue.getAcceptedShots(holeId);
      if (!shots.length) {
        return { applied: 0, rejected: 0 };
      }
      if (!decisions || decisions.length === 0) {
        const shouldApply = await confirmHandler(holeId, shots);
        if (!shouldApply) {
          await recordHoleAccuracy(holeId, shots);
          autoQueue.markHoleReviewed(holeId);
          return { applied: 0, rejected: shots.length };
        }
      }
      const decisionMap = buildDecisionMap(decisions);
      const { applied, rejected } = await applyReviewedShots(shots, decisionMap);
      if (!autoQueue.getAcceptedShots(holeId).length) {
        autoQueue.finalizeHole(holeId);
      }
      await recordHoleAccuracy(holeId, shots);
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

export function __setConfirmHandlerForTest(next: ConfirmHandler | null): void {
  confirmHandler = next ?? confirmWithAlert;
}
