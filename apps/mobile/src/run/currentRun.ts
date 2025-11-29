import { createRunForCurrentRound, submitScorecard } from '@app/api/runs';
import type { CourseBundle } from '@app/api/courses';
import { saveLastRoundSummary, type LastRoundSummary } from '@app/run/lastRound';
import { removeItem, getItem, setItem } from '@app/storage/asyncStorage';

export type RoundMode = 'strokeplay' | 'practice';

export interface HoleScore {
  strokes: number;
  putts: number;
  gir?: boolean;
  fir?: boolean;
}

export type Scorecard = Record<number, HoleScore>;

export interface CurrentRun {
  runId?: string;
  courseId: string;
  courseName: string;
  teeId: string;
  teeName: string;
  holes: number;
  startedAt: string;
  mode: RoundMode;
  currentHole: number;
  scorecard: Scorecard;
}

export const CURRENT_RUN_KEY = 'golfiq.currentRun.v1';

export async function saveCurrentRun(run: CurrentRun): Promise<void> {
  await setItem(CURRENT_RUN_KEY, JSON.stringify(run));
}

export async function loadCurrentRun(): Promise<CurrentRun | null> {
  const raw = await getItem(CURRENT_RUN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CurrentRun;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      scorecard: parsed.scorecard ?? {},
    } as CurrentRun;
  } catch {
    await removeItem(CURRENT_RUN_KEY);
    return null;
  }
}

export async function clearCurrentRun(): Promise<void> {
  await removeItem(CURRENT_RUN_KEY);
}

export function getHoleScore(currentRun: CurrentRun, holeNumber: number): HoleScore {
  const existing = currentRun.scorecard?.[holeNumber];
  if (existing) return existing;
  return { strokes: 1, putts: 0 };
}

function normalizeScore(score: HoleScore): HoleScore {
  return {
    strokes: Math.max(1, Math.round(score.strokes)),
    putts: Math.max(0, Math.round(score.putts)),
    gir: score.gir ?? false,
    fir: score.fir ?? false,
  };
}

export function countScoredHoles(scorecard: Scorecard): number {
  return Object.keys(scorecard ?? {}).length;
}

export async function updateHoleScore(
  currentRun: CurrentRun,
  holeNumber: number,
  patch: Partial<HoleScore>,
): Promise<CurrentRun> {
  const next = { ...currentRun } as CurrentRun;
  const existing = getHoleScore(currentRun, holeNumber);
  next.scorecard = {
    ...next.scorecard,
    [holeNumber]: normalizeScore({ ...existing, ...patch }),
  };
  await saveCurrentRun(next);
  return next;
}

function computeSummary(run: CurrentRun, bundle: CourseBundle): LastRoundSummary {
  let totalStrokes = 0;
  let totalPar = 0;
  Object.entries(run.scorecard ?? {}).forEach(([holeNumber, score]) => {
    totalStrokes += score.strokes;
    const hole = bundle.holes.find((h) => h.number === Number(holeNumber));
    if (hole?.par) {
      totalPar += hole.par;
    }
  });

  const relative = totalPar ? totalStrokes - totalPar : null;
  const relativeToPar = relative === null ? undefined : `${relative >= 0 ? '+' : ''}${relative}`;

  return {
    runId: run.runId ?? '',
    courseName: run.courseName,
    teeName: run.teeName,
    holes: run.holes,
    totalStrokes,
    relativeToPar,
    finishedAt: new Date().toISOString(),
  };
}

export type FinishRoundResult =
  | { success: true; runId: string; summary: LastRoundSummary }
  | { success: false; error: string };

export async function finishCurrentRound(
  currentRun: CurrentRun,
  bundle: CourseBundle,
): Promise<FinishRoundResult> {
  if (!Object.keys(currentRun.scorecard ?? {}).length) {
    return { success: false, error: 'Add at least one hole before finishing.' };
  }

  try {
    let runId = currentRun.runId;
    if (!runId) {
      const created = await createRunForCurrentRound(currentRun);
      runId = created.runId;
      await saveCurrentRun({ ...currentRun, runId });
    }

    await submitScorecard(runId!, currentRun);

    const summary = computeSummary({ ...currentRun, runId }, bundle);

    await saveLastRoundSummary(summary);
    await clearCurrentRun();

    return { success: true, runId: runId!, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to finish round';
    return { success: false, error: message };
  }
}
