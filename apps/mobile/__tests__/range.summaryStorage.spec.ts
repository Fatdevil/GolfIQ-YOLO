import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { clearLastRangeSessionSummary, loadLastRangeSessionSummary, saveLastRangeSessionSummary } from '@app/range/rangeSummaryStorage';
import * as storage from '@app/storage/asyncStorage';

const summary = {
  id: 'session-1',
  startedAt: '2024-01-01T00:00:00.000Z',
  finishedAt: '2024-01-01T01:00:00.000Z',
  club: '7i',
  targetDistanceM: 150,
  shotCount: 3,
  avgCarryM: 145,
  tendency: 'straight' as const,
};

describe('rangeSummaryStorage', () => {
  beforeEach(() => {
    vi.spyOn(storage, 'setItem').mockResolvedValue();
    vi.spyOn(storage, 'getItem').mockResolvedValue(null);
    vi.spyOn(storage, 'removeItem').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves and loads summary', async () => {
    await saveLastRangeSessionSummary(summary);
    expect(storage.setItem).toHaveBeenCalled();

    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(summary));

    const loaded = await loadLastRangeSessionSummary();
    expect(loaded).toEqual(summary);
  });

  it('returns null on invalid json', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce('not-json');
    const loaded = await loadLastRangeSessionSummary();
    expect(loaded).toBeNull();
  });

  it('persists optional reflection fields', async () => {
    const withReflection = { ...summary, sessionRating: 5, reflectionNotes: 'Felt great' };

    await saveLastRangeSessionSummary(withReflection);
    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(withReflection));

    const loaded = await loadLastRangeSessionSummary();
    expect(loaded?.sessionRating).toBe(5);
    expect(loaded?.reflectionNotes).toBe('Felt great');
  });

  it('clears summary', async () => {
    await clearLastRangeSessionSummary();
    expect(storage.removeItem).toHaveBeenCalled();
  });
});
