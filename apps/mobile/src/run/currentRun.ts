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
  schemaVersion: number;
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
  isGuest?: boolean;
}

export const CURRENT_RUN_VERSION = 1;
export const CURRENT_RUN_KEY = 'golfiq.currentRun.v1';

function isHoleCountValid(value: unknown): value is number {
  return typeof value === 'number' && (value === 9 || value === 18 || (value >= 1 && value <= 18));
}

export function isValidCurrentRun(raw: unknown): raw is CurrentRun {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;

  if (data.schemaVersion !== CURRENT_RUN_VERSION) return false;
  if (typeof data.courseId !== 'string' || !data.courseId) return false;
  if (typeof data.courseName !== 'string' || !data.courseName) return false;
  if (typeof data.teeId !== 'string' || !data.teeId) return false;
  if (typeof data.teeName !== 'string' || !data.teeName) return false;
  if (!isHoleCountValid(data.holes)) return false;
  if (typeof data.startedAt !== 'string' || !data.startedAt) return false;
  if (data.mode !== 'strokeplay' && data.mode !== 'practice') return false;
  if (typeof data.currentHole !== 'number') return false;
  const holeBound = typeof data.holes === 'number' ? data.holes : 18;
  if (data.currentHole < 1 || data.currentHole > holeBound) return false;
  if (typeof data.scorecard !== 'object' || data.scorecard === null) return false;

  return true;
}

function migrateCurrentRun(raw: any): CurrentRun | null {
  if (!raw || typeof raw !== 'object') return null;
  if ('schemaVersion' in raw) return null;

  const candidate = {
    ...raw,
    scorecard: raw.scorecard ?? {},
  } as Partial<CurrentRun> & Record<string, unknown>;

  if (
    typeof candidate.courseId === 'string' &&
    typeof candidate.courseName === 'string' &&
    typeof candidate.teeId === 'string' &&
    typeof candidate.teeName === 'string' &&
    isHoleCountValid(candidate.holes) &&
    typeof candidate.startedAt === 'string' &&
    (candidate.mode === 'strokeplay' || candidate.mode === 'practice') &&
    typeof candidate.currentHole === 'number'
  ) {
    const migrated: CurrentRun = {
      ...candidate,
      schemaVersion: CURRENT_RUN_VERSION,
      scorecard: candidate.scorecard ?? {},
    } as CurrentRun;
    console.info('[currentRun] Migrated currentRun from legacy shape to v1.');
    return migrated;
  }

  return null;
}

export async function saveCurrentRun(run: CurrentRun): Promise<void> {
  const withVersion: CurrentRun = { ...run, schemaVersion: CURRENT_RUN_VERSION };
  await setItem(CURRENT_RUN_KEY, JSON.stringify(withVersion));
}

export async function loadCurrentRun(): Promise<CurrentRun | null> {
  const raw = await getItem(CURRENT_RUN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidCurrentRun(parsed)) {
      return parsed;
    }
    const migrated = migrateCurrentRun(parsed);
    if (migrated && isValidCurrentRun(migrated)) {
      await saveCurrentRun(migrated);
      return migrated;
    }
    console.warn('[currentRun] Invalid or corrupted currentRun data, cleared.');
    await removeItem(CURRENT_RUN_KEY);
    return null;
  } catch (err) {
    console.warn('[currentRun] Failed to parse current run JSON', err);
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
