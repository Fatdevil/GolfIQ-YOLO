import { RoundRecorder } from '../../../../shared/round/recorder';
import { autoQueue, type AcceptedAutoShot } from './AutoCaptureQueue';

type RoundRecorderLike = Pick<typeof RoundRecorder, 'addShot'>;

let recorder: RoundRecorderLike = RoundRecorder;

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

async function applyShots(shots: AcceptedAutoShot[]): Promise<number> {
  let applied = 0;
  for (const shot of shots) {
    const start = shot.start;
    if (!start) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[PostHoleReconciler] Missing start for auto shot', shot);
      }
      autoQueue.finalizeShot(shot.holeId, shot.id);
      continue;
    }
    const lie = shot.lie ?? 'Fairway';
    try {
      await recorder.addShot(shot.holeId, {
        kind: 'Full',
        start,
        startLie: lie,
        source: shot.source,
        club: shot.club,
      });
      autoQueue.finalizeShot(shot.holeId, shot.id);
      applied += 1;
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[PostHoleReconciler] Failed to record auto shot', error);
      }
    }
  }
  return applied;
}

let confirmHandler: ConfirmHandler = confirmWithAlert;

export const PostHoleReconciler = {
  async reviewAndApply(holeId: number): Promise<{ applied: number }> {
    if (!Number.isFinite(holeId)) {
      return { applied: 0 };
    }
    try {
      const shots = autoQueue.getAcceptedShots(holeId);
      if (!shots.length) {
        return { applied: 0 };
      }
      const shouldApply = await confirmHandler(holeId, shots);
      if (!shouldApply) {
        autoQueue.markHoleReviewed(holeId);
        return { applied: 0 };
      }
      const applied = await applyShots(shots);
      if (applied === shots.length) {
        autoQueue.finalizeHole(holeId);
      }
      return { applied };
    } catch (error) {
      console.warn('[PostHoleReconciler] reviewAndApply failed', error);
      return { applied: 0 };
    }
  },
};

export type PostHoleReconcilerType = typeof PostHoleReconciler;

export async function reconcileIfPending(holeId: number): Promise<number> {
  const { applied } = await PostHoleReconciler.reviewAndApply(holeId);
  return applied;
}

export function __setRoundRecorderForTest(next: RoundRecorderLike | null): void {
  recorder = next ?? RoundRecorder;
}

export function __setConfirmHandlerForTest(next: ConfirmHandler | null): void {
  confirmHandler = next ?? confirmWithAlert;
}
