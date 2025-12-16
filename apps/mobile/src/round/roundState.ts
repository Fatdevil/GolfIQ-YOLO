import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';
import type { Round } from '@app/api/roundClient';

export interface ActiveRoundPreferences {
  tournamentSafe?: boolean;
}

export interface ActiveRoundState {
  round: Round;
  currentHole: number;
  preferences?: ActiveRoundPreferences;
}

const ROUND_STATE_KEY = 'golfiq.activeRound.v1';

export async function loadActiveRoundState(): Promise<ActiveRoundState | null> {
  const raw = await getItem(ROUND_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveRoundState;
  } catch {
    return null;
  }
}

export async function saveActiveRoundState(state: ActiveRoundState): Promise<void> {
  await setItem(ROUND_STATE_KEY, JSON.stringify(state));
}

export async function clearActiveRoundState(): Promise<void> {
  await removeItem(ROUND_STATE_KEY);
}

export { ROUND_STATE_KEY };
