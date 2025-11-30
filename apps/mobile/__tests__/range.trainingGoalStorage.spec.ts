import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCurrentTrainingGoal,
  loadCurrentTrainingGoal,
  saveCurrentTrainingGoal,
  TRAINING_GOAL_KEY,
} from '@app/range/rangeTrainingGoalStorage';
import * as storage from '@app/storage/asyncStorage';

const now = new Date('2024-05-01T12:00:00.000Z');

describe('rangeTrainingGoalStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(storage, 'getItem').mockResolvedValue(null);
    vi.spyOn(storage, 'setItem').mockResolvedValue();
    vi.spyOn(storage, 'removeItem').mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves a new goal with id and createdAt', async () => {
    const saved = await saveCurrentTrainingGoal(' Hit draws ');

    expect(storage.setItem).toHaveBeenCalledWith(TRAINING_GOAL_KEY, expect.any(String));
    expect(saved).not.toBeNull();
    expect(saved?.text).toBe('Hit draws');
    expect(saved?.createdAt).toBe(now.toISOString());
    expect(saved?.id).toBeTruthy();
    expect(saved?.updatedAt).toBeUndefined();
  });

  it('updates existing goal while keeping id and createdAt', async () => {
    const existing = {
      id: 'goal-1',
      text: 'Old goal',
      createdAt: new Date('2024-04-01T00:00:00.000Z').toISOString(),
    };
    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(existing));

    const saved = await saveCurrentTrainingGoal('New focus');

    expect(saved?.id).toBe(existing.id);
    expect(saved?.createdAt).toBe(existing.createdAt);
    expect(saved?.text).toBe('New focus');
    expect(saved?.updatedAt).toBe(now.toISOString());
  });

  it('clears goal when saving empty text', async () => {
    await saveCurrentTrainingGoal('   ');

    expect(storage.removeItem).toHaveBeenCalledWith(TRAINING_GOAL_KEY);
  });

  it('clears goal explicitly and load returns null', async () => {
    await clearCurrentTrainingGoal();
    expect(storage.removeItem).toHaveBeenCalledWith(TRAINING_GOAL_KEY);
    vi.mocked(storage.getItem).mockResolvedValueOnce(null);
    const loaded = await loadCurrentTrainingGoal();
    expect(loaded).toBeNull();
  });

  it('handles corrupt json gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(storage.getItem).mockResolvedValueOnce('oops');

    const loaded = await loadCurrentTrainingGoal();

    expect(loaded).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
