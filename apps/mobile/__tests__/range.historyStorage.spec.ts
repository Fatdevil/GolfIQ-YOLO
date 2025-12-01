import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendRangeHistoryEntry, loadRangeHistory, MAX_HISTORY_ENTRIES } from '@app/range/rangeHistoryStorage';
import type { RangeSessionSummary } from '@app/range/rangeSession';
import * as storage from '@app/storage/asyncStorage';

const baseSummary: RangeSessionSummary = {
  id: 'session-1',
  startedAt: '2024-01-01T00:00:00.000Z',
  finishedAt: '2024-01-01T01:00:00.000Z',
  club: '7i',
  targetDistanceM: 150,
  shotCount: 5,
  avgCarryM: 148,
  tendency: 'left',
};

describe('rangeHistoryStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T00:00:00.000Z'));
    vi.spyOn(storage, 'getItem').mockResolvedValue(null);
    vi.spyOn(storage, 'setItem').mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prepends new entries and trims to max length', async () => {
    const existing = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, index) => ({
      id: `old-${index}`,
      savedAt: new Date(2023, 0, index + 1).toISOString(),
      summary: { ...baseSummary, id: `old-${index}` },
    }));
    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(existing));

    await appendRangeHistoryEntry(baseSummary);

    expect(storage.setItem).toHaveBeenCalled();
    const [, savedRaw] = vi.mocked(storage.setItem).mock.calls[0];
    const saved = JSON.parse(savedRaw!) as unknown[];
    expect(saved).toHaveLength(MAX_HISTORY_ENTRIES);
    expect((saved[0] as { id: string }).id).toBe(baseSummary.id);
  });

  it('updates existing entry when summary id matches', async () => {
    const existing = [
      {
        id: 'session-1',
        savedAt: '2024-01-01T00:00:00.000Z',
        summary: { ...baseSummary, shotCount: 3 },
      },
    ];
    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(existing));

    await appendRangeHistoryEntry({ ...baseSummary, sessionRating: 5, reflectionNotes: 'Great tempo' });

    expect(storage.setItem).toHaveBeenCalled();
    const [, savedRaw] = vi.mocked(storage.setItem).mock.calls[0];
    const saved = JSON.parse(savedRaw!) as { savedAt: string; summary: RangeSessionSummary }[];
    expect(saved[0].savedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(saved[0].summary.sessionRating).toBe(5);
    expect(saved[0].summary.reflectionNotes).toBe('Great tempo');
    expect(saved).toHaveLength(1);
  });

  it('handles corrupted history without throwing', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce('not-json');

    await appendRangeHistoryEntry(baseSummary);

    expect(storage.setItem).toHaveBeenCalled();
    const [, savedRaw] = vi.mocked(storage.setItem).mock.calls[0];
    const saved = JSON.parse(savedRaw!) as { id: string }[];
    expect(saved[0].id).toBe(baseSummary.id);
  });

  it('loads history sorted newest first and filters invalid entries', async () => {
    const rawEntries = [
      { id: 'older', savedAt: '2024-01-01T00:00:00.000Z', summary: { ...baseSummary, id: 'older' } },
      { id: 'newer', savedAt: '2024-02-01T00:00:00.000Z', summary: { ...baseSummary, id: 'newer' } },
      { id: 'missing-summary', savedAt: '2024-03-01T00:00:00.000Z' },
    ];
    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(rawEntries));

    const loaded = await loadRangeHistory();

    expect(loaded.map((entry) => entry.id)).toEqual(['newer', 'older']);
  });

  it('returns empty array on corrupted json when loading', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce('oops');

    const loaded = await loadRangeHistory();

    expect(loaded).toEqual([]);
  });
});
