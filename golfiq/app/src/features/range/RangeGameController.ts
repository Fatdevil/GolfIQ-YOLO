import { createGame, endGame, recordShot } from '../../../../../shared/games/range/scoring';
import type { GameState, RingTarget, ShotIn } from '../../../../../shared/games/range/types';

declare const __DEV__: boolean | undefined;

export type RangeGameListener = (state: GameState | null) => void;

type ControllerState = {
  game: GameState | null;
};

const state: ControllerState = {
  game: null,
};

const listeners = new Set<RangeGameListener>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(state.game);
    } catch (error) {
      if (__DEV__) {
        console.warn('[RangeGameController] listener failed', error);
      }
    }
  }
}

export function start(targets: RingTarget[], ts = Date.now()): GameState {
  state.game = createGame(targets, ts);
  emit();
  return state.game;
}

export function stop(ts = Date.now()): GameState | null {
  if (!state.game) {
    return null;
  }
  state.game = endGame(state.game, ts);
  emit();
  return state.game;
}

export function reset(): void {
  state.game = null;
  emit();
}

export function addShot(shot: ShotIn): GameState | null {
  if (!state.game) {
    return null;
  }
  state.game = recordShot(state.game, shot);
  emit();
  return state.game;
}

export function getState(): GameState | null {
  return state.game;
}

export function subscribe(listener: RangeGameListener): () => void {
  listeners.add(listener);
  listener(state.game);
  return () => {
    listeners.delete(listener);
  };
}

export const RangeGameController = {
  start,
  stop,
  addShot,
  reset,
  getState,
  subscribe,
};
