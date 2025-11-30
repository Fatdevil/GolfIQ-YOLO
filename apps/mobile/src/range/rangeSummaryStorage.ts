import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';
import type { RangeSessionSummary } from '@app/range/rangeSession';

const LAST_SESSION_KEY = 'golfiq.range.lastSession.v1';

export async function saveLastRangeSessionSummary(summary: RangeSessionSummary): Promise<void> {
  await setItem(LAST_SESSION_KEY, JSON.stringify(summary));
}

export async function loadLastRangeSessionSummary(): Promise<RangeSessionSummary | null> {
  const raw = await getItem(LAST_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') {
      return parsed as RangeSessionSummary;
    }
  } catch (error) {
    console.warn('[range] Failed to parse lastSession summary', error);
  }
  return null;
}

export async function clearLastRangeSessionSummary(): Promise<void> {
  await removeItem(LAST_SESSION_KEY);
}
