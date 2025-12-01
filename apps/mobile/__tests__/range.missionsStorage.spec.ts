import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as asyncStorage from '@app/storage/asyncStorage';
import { loadRangeMissionState, setPinnedMission, toggleMissionCompleted } from '@app/range/rangeMissionsStorage';

vi.mock('@app/storage/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

describe('rangeMissionsStorage', () => {
  beforeEach(() => {
    vi.mocked(asyncStorage.getItem).mockReset();
    vi.mocked(asyncStorage.setItem).mockReset();
    vi.mocked(asyncStorage.getItem).mockResolvedValue(null);
  });

  it('returns default state when storage is empty or corrupt', async () => {
    const state = await loadRangeMissionState();
    expect(state).toEqual({ completedMissionIds: [] });

    vi.mocked(asyncStorage.getItem).mockResolvedValue('not-json');
    const fallback = await loadRangeMissionState();
    expect(fallback).toEqual({ completedMissionIds: [] });
  });

  it('adds and removes mission ids when toggling completion', async () => {
    const added = await toggleMissionCompleted('mission-1');
    expect(added.completedMissionIds).toContain('mission-1');
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'golfiq.range.missions.state.v1',
      JSON.stringify(added),
    );

    vi.mocked(asyncStorage.getItem).mockResolvedValue(JSON.stringify(added));
    const removed = await toggleMissionCompleted('mission-1');
    expect(removed.completedMissionIds).not.toContain('mission-1');
  });

  it('sets and clears pinned mission id', async () => {
    const pinned = await setPinnedMission('mission-2');
    expect(pinned.pinnedMissionId).toBe('mission-2');

    vi.mocked(asyncStorage.getItem).mockResolvedValue(JSON.stringify(pinned));
    const cleared = await setPinnedMission(undefined);
    expect(cleared.pinnedMissionId).toBeUndefined();
  });
});
