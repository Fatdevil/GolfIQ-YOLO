import type { Event, Participant } from './types';
import type { HandicapSetup } from '../whs/types';

type EventContext = {
  event: Event;
  participant: Participant | null;
  handicap?: {
    setup: HandicapSetup;
    courseHandicap: number;
    playingHandicap: number;
    strokesPerHole?: number[];
  } | null;
};

let currentContext: EventContext | null = null;
const listeners = new Set<(context: EventContext | null) => void>();

export function setEventContext(context: EventContext | null): void {
  currentContext = context;
  for (const listener of listeners) {
    try {
      listener(currentContext);
    } catch (error) {
      console.warn('[events/state] listener error', error);
    }
  }
}

export function getEventContext(): EventContext | null {
  return currentContext;
}

export function subscribeEventContext(
  listener: (context: EventContext | null) => void,
): () => void {
  listeners.add(listener);
  try {
    listener(currentContext);
  } catch (error) {
    console.warn('[events/state] listener error', error);
  }
  return () => {
    listeners.delete(listener);
  };
}
