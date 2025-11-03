export type HoleAccuracy = {
  holeId: number;
  holeIndex: number;
  timestamp: number;
  tp: number;
  fp: number;
  fn: number;
};

const MATCH_WINDOW_MS = 2000;

const rows: HoleAccuracy[] = [];

type AutoShot = { ts: number };
type RecordedShot = { ts: number; source?: string };

type NormalizedRecorded = { ts: number; source: string | undefined; index: number };

type Confusion = { tp: number; fp: number; fn: number };

export function computeConfusion(autoAccepted: AutoShot[], recorded: RecordedShot[]): Confusion {
  const autoShots = autoAccepted
    .map((shot) => Number(shot.ts))
    .filter((ts): ts is number => Number.isFinite(ts))
    .sort((a, b) => a - b);

  const recordedShots: NormalizedRecorded[] = recorded
    .map((shot, index) => ({
      ts: Number(shot.ts),
      source: shot.source,
      index,
    }))
    .filter((entry): entry is NormalizedRecorded => Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts);

  let tp = 0;
  let fp = 0;
  const matched = new Set<number>();

  for (const ts of autoShots) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const candidate of recordedShots) {
      if (matched.has(candidate.index)) {
        continue;
      }
      const delta = Math.abs(candidate.ts - ts);
      if (delta > MATCH_WINDOW_MS) {
        if (candidate.ts > ts && delta > bestDelta) {
          break;
        }
        continue;
      }
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = candidate.index;
      }
    }
    if (bestIndex >= 0) {
      matched.add(bestIndex);
      tp += 1;
    } else {
      fp += 1;
    }
  }

  let fn = 0;
  for (const shot of recordedShots) {
    if (matched.has(shot.index)) {
      continue;
    }
    const source = typeof shot.source === 'string' ? shot.source.toLowerCase() : '';
    if (source === 'auto') {
      continue;
    }
    fn += 1;
  }

  return { tp, fp, fn };
}

export function appendHoleAccuracy(row: HoleAccuracy): void {
  rows.push(row);
  try {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('SS-ACCURACY', JSON.stringify(row));
    }
  } catch {
    // ignore logging errors
  }
}

export function exportHoleAccuracy(): { text: string; webDownload?: () => void } {
  const text = rows.map((row) => JSON.stringify(row)).join('\n');

  const canDownload =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Blob === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function';

  let webDownload: (() => void) | undefined;
  if (canDownload) {
    webDownload = () => {
      try {
        const blob = new Blob([text], { type: 'application/x-ndjson' });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = 'shotsense-accuracy.ndjson';
        const root = document.body ?? document.documentElement;
        root.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(href);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('[shotsenseMetrics] download failed', error);
        }
      }
    };
  }

  return { text, webDownload };
}

export const __TESTING__ = {
  _rows: rows,
  clear(): void {
    rows.splice(0, rows.length);
  },
};
