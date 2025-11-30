import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_RUN_KEY,
  CURRENT_RUN_VERSION,
  clearCurrentRun,
  finishCurrentRound,
  getHoleScore,
  loadCurrentRun,
  saveCurrentRun,
  updateHoleScore,
  type CurrentRun,
} from '@app/run/currentRun';
import { LAST_ROUND_KEY } from '@app/run/lastRound';
import { createRunForCurrentRound, submitScorecard } from '@app/api/runs';

vi.mock('@app/api/runs', () => ({
  createRunForCurrentRound: vi.fn(),
  submitScorecard: vi.fn(),
}));

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
    schemaVersion: CURRENT_RUN_VERSION,
    courseId: 'c1',
    courseName: 'Pebble',
    teeId: 't1',
    teeName: 'Blue',
    holes: 18,
    startedAt: '2024-01-01T00:00:00.000Z',
    mode: 'strokeplay',
    currentHole: 1,
    scorecard: {},
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

    expect(storage.setItem).toHaveBeenCalledWith(
      CURRENT_RUN_KEY,
      JSON.stringify({ ...sampleRun, schemaVersion: CURRENT_RUN_VERSION }),
    );
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

  it('returns null and clears mismatched shape', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({ ...sampleRun, schemaVersion: 99, courseId: undefined }),
    );

    const loaded = await loadCurrentRun();

    expect(loaded).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });

  it('migrates legacy data without schemaVersion', async () => {
    const legacy = { ...sampleRun } as any;
    delete legacy.schemaVersion;
    storage.getItem.mockResolvedValue(JSON.stringify(legacy));

    const loaded = await loadCurrentRun();

    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(CURRENT_RUN_VERSION);
    expect(storage.setItem).toHaveBeenCalledWith(CURRENT_RUN_KEY, expect.any(String));
    const payload = storage.setItem.mock.calls[0]?.[1];
    expect(JSON.parse(payload ?? '{}')).toEqual({ ...sampleRun, schemaVersion: CURRENT_RUN_VERSION });
  });

  it('clears run from storage', async () => {
    await clearCurrentRun();

    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
  });

  it('updates hole score and persists', async () => {
    const updated = await updateHoleScore(sampleRun, 1, { strokes: 4, putts: 1 });

    expect(updated.scorecard[1]).toEqual({ strokes: 4, putts: 1, gir: false, fir: false });
    expect(storage.setItem).toHaveBeenCalledWith(CURRENT_RUN_KEY, JSON.stringify(updated));
    expect(getHoleScore(updated, 1).strokes).toBe(4);
  });

  it('finishes round by creating run, submitting score, and caching summary', async () => {
    const runWithScore: CurrentRun = {
      ...sampleRun,
      scorecard: {
        1: { strokes: 4, putts: 2 },
      },
    };
    const bundle = {
      holes: [{ number: 1, par: 4 }],
      id: 'c1',
      name: 'Pebble',
      tees: [],
    } as any;

    vi.mocked(createRunForCurrentRound).mockResolvedValue({ runId: 'run-1' });
    vi.mocked(submitScorecard).mockResolvedValue();

    const result = await finishCurrentRound(runWithScore, bundle);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.summary.runId).toBe('run-1');
    }
    expect(createRunForCurrentRound).toHaveBeenCalled();
    expect(submitScorecard).toHaveBeenCalledWith('run-1', runWithScore);
    expect(storage.removeItem).toHaveBeenCalledWith(CURRENT_RUN_KEY);
    expect(storage.setItem).toHaveBeenCalledWith(LAST_ROUND_KEY, expect.any(String));
  });
});
