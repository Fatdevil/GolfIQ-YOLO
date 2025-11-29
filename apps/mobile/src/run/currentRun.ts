import { removeItem, getItem, setItem } from '@app/storage/asyncStorage';

export type RoundMode = 'strokeplay' | 'practice';

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
    return parsed;
  } catch {
    await removeItem(CURRENT_RUN_KEY);
    return null;
  }
}

export async function clearCurrentRun(): Promise<void> {
  await removeItem(CURRENT_RUN_KEY);
}
