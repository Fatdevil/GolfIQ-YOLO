import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';

export interface LastRoundSummary {
  runId: string;
  courseName: string;
  teeName: string;
  holes: number;
  totalStrokes: number;
  relativeToPar?: string;
  finishedAt: string;
}

export const LAST_ROUND_KEY = 'golfiq.lastRound.v1';

export async function saveLastRoundSummary(summary: LastRoundSummary): Promise<void> {
  await setItem(LAST_ROUND_KEY, JSON.stringify(summary));
}

export async function loadLastRoundSummary(): Promise<LastRoundSummary | null> {
  const raw = await getItem(LAST_ROUND_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastRoundSummary;
    if (!parsed || typeof parsed !== 'object' || !parsed.runId) return null;
    return parsed;
  } catch {
    await removeItem(LAST_ROUND_KEY);
    return null;
  }
}

export async function clearLastRoundSummary(): Promise<void> {
  await removeItem(LAST_ROUND_KEY);
}
