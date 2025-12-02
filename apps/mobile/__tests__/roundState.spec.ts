import { clearActiveRoundState, loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { describe, expect, it } from 'vitest';
import type { Round } from '@app/api/roundClient';

const sampleRound: Round = {
  id: 'r1',
  holes: 18,
  startedAt: '2024-01-01T00:00:00Z',
};

describe('roundState', () => {
  it('saves and loads active round state', async () => {
    await clearActiveRoundState();
    await saveActiveRoundState({ round: sampleRound, currentHole: 3 });
    const loaded = await loadActiveRoundState();
    expect(loaded?.currentHole).toBe(3);
    expect(loaded?.round.id).toBe('r1');
  });

  it('clears active round', async () => {
    await saveActiveRoundState({ round: sampleRound, currentHole: 1 });
    await clearActiveRoundState();
    const loaded = await loadActiveRoundState();
    expect(loaded).toBeNull();
  });
});
