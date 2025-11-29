import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_RUN_KEY, clearCurrentRun, loadCurrentRun, saveCurrentRun, type CurrentRun } from '@app/run/currentRun';

vi.mock('@react-native-async-storage/async-storage', () => {
  const getItem = vi.fn(async (_key: string) => null);
  const setItem = vi.fn(async (_key: string, _value: string) => {});
  const removeItem = vi.fn(async (_key: string) => {});

  return {
    default: {
      getItem,
      setItem,
      removeItem,
    },
  };
});

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

  const storage = vi.mocked(AsyncStorage);

  beforeEach(() => {
    vi.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue();
    storage.removeItem.mockResolvedValue();
  });

  it('saves run to storage', async () => {
    await saveCurrentRun(sampleRun);

    expect(storage.setItem).toHaveBeenCalledWith(CURRENT_RUN_KEY, JSON.stringify(sampleRun));
  });

  it('loads run from storage', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(sampleRun));

    const loaded = await loadCurrentRun();

    expect(storage.getItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
    expect(loaded).toEqual(sampleRun);
  });

  it('returns null and clears invalid data', async () => {
    storage.getItem.mockResolvedValue('not-json');

    const loaded = await loadCurrentRun();

    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });

  it('clears run from storage', async () => {
    await clearCurrentRun();

    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });
});
