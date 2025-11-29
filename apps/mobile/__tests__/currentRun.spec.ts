import { describe, expect, it, vi, beforeEach } from 'vitest';

import { CURRENT_RUN_KEY, clearCurrentRun, loadCurrentRun, saveCurrentRun, type CurrentRun } from '@app/run/currentRun';
import * as storage from '@app/storage/asyncStorage';

vi.mock('@app/storage/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

describe('currentRun persistence', () => {
  const sampleRun: CurrentRun = {
    courseId: 'c1',
    courseName: 'Pebble',
    teeId: 't1',
    teeName: 'Blue',
    holes: 18,
    startedAt: '2024-01-01T00:00:00.000Z',
    mode: 'strokeplay',
    currentHole: 1,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('saves run to storage', async () => {
    vi.mocked(storage.setItem).mockResolvedValue();

    await saveCurrentRun(sampleRun);

    expect(storage.setItem).toHaveBeenCalledWith(CURRENT_RUN_KEY, JSON.stringify(sampleRun));
  });

  it('loads run from storage', async () => {
    vi.mocked(storage.getItem).mockResolvedValue(JSON.stringify(sampleRun));

    const loaded = await loadCurrentRun();

    expect(storage.getItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
    expect(loaded).toEqual(sampleRun);
  });

  it('returns null and clears invalid data', async () => {
    vi.mocked(storage.getItem).mockResolvedValue('not-json');
    vi.mocked(storage.removeItem).mockResolvedValue();

    const loaded = await loadCurrentRun();

    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });

  it('clears run from storage', async () => {
    vi.mocked(storage.removeItem).mockResolvedValue();

    await clearCurrentRun();

    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });
});
