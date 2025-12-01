import { getItem, setItem } from '@app/storage/asyncStorage';
import type { RangeSessionSummary } from '@app/range/rangeSession';

export interface RangeHistoryEntry {
  id: string;
  savedAt: string;
  summary: RangeSessionSummary;
}

const HISTORY_KEY = 'golfiq.range.history.v1';
const MAX_HISTORY_ENTRIES = 30;

function parseHistory(raw: string): RangeHistoryEntry[] {
  const timestamp = (value: string | undefined): number => {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const casted = entry as Partial<RangeHistoryEntry> & { summary?: Partial<RangeSessionSummary> };
        if (!casted.summary || typeof casted.summary !== 'object') return null;
        if (typeof casted.summary.id !== 'string') return null;
        if (typeof casted.id !== 'string') return null;
        if (typeof casted.savedAt !== 'string') return null;
        return {
          id: casted.id,
          savedAt: casted.savedAt,
          summary: casted.summary as RangeSessionSummary,
        };
      })
      .filter((entry): entry is RangeHistoryEntry => Boolean(entry))
      .sort((a, b) => timestamp(b.savedAt) - timestamp(a.savedAt));
  } catch (error) {
    console.warn('[range] Failed to parse range history', error);
    return [];
  }
}

export async function loadRangeHistory(): Promise<RangeHistoryEntry[]> {
  const raw = await getItem(HISTORY_KEY);
  if (!raw) return [];
  return parseHistory(raw);
}

export async function appendRangeHistoryEntry(summary: RangeSessionSummary): Promise<void> {
  const raw = await getItem(HISTORY_KEY);
  const existing = raw ? parseHistory(raw) : [];

  const existingIndex = existing.findIndex((entry) => entry.summary.id === summary.id);
  const entry: RangeHistoryEntry = existingIndex >= 0
    ? { ...existing[existingIndex], summary }
    : {
        id: typeof summary.id === 'string' ? summary.id : `${Date.now()}`,
        savedAt: new Date().toISOString(),
        summary,
      };

  const filteredExisting = existingIndex >= 0 ? existing.filter((_, index) => index !== existingIndex) : existing;
  const next = [entry, ...filteredExisting].slice(0, MAX_HISTORY_ENTRIES);
  await setItem(HISTORY_KEY, JSON.stringify(next));
}

export async function markSessionsSharedToCoach(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;

  const raw = await getItem(HISTORY_KEY);
  if (!raw) return;

  const existing = parseHistory(raw);
  let changed = false;

  const next = existing.map((entry) => {
    if (sessionIds.includes(entry.summary.id)) {
      if (entry.summary.sharedToCoach) return entry;
      changed = true;
      return {
        ...entry,
        summary: {
          ...entry.summary,
          sharedToCoach: true,
        },
      } satisfies RangeHistoryEntry;
    }
    return entry;
  });

  if (changed) {
    await setItem(HISTORY_KEY, JSON.stringify(next));
  }
}

export { MAX_HISTORY_ENTRIES };
