export type ReliabilityEvent =
  | {
      type: "uploader:queued";
      timestamp: number;
      kind: string;
      localId: string;
      pending: number;
    }
  | {
      type: "uploader:network";
      timestamp: number;
      offline: boolean;
      reason?: string;
    }
  | {
      type: "uploader:attempt";
      timestamp: number;
      localId: string;
      attempt: number;
      kind: string;
    }
  | {
      type: "uploader:success";
      timestamp: number;
      localId: string;
      kind: string;
      attempts: number;
    }
  | {
      type: "uploader:failure";
      timestamp: number;
      localId: string;
      kind: string;
      attempts: number;
      terminal: boolean;
      reason: string;
    }
  | {
      type: "model:init_failed";
      timestamp: number;
      platform: string;
      attemptedId?: string;
      reason: string;
    }
  | {
      type: "model:fallback";
      timestamp: number;
      platform: string;
      fallbackId?: string;
      attemptedId?: string;
      reason: string;
    };

type Listener = (event: ReliabilityEvent) => void;

const listeners = new Set<Listener>();
let events: ReliabilityEvent[] = [];

const MAX_EVENT_AGE_MS = 60 * 60 * 1000; // keep one hour of history

function prune(now: number): void {
  const cutoff = now - MAX_EVENT_AGE_MS;
  events = events.filter((event) => event.timestamp >= cutoff);
}

export function emitReliabilityEvent(event: ReliabilityEvent): void {
  const timestamped = { ...event, timestamp: event.timestamp ?? Date.now() } as ReliabilityEvent;
  events.push(timestamped);
  prune(timestamped.timestamp);
  listeners.forEach((listener) => {
    try {
      listener(timestamped);
    } catch {
      // listeners are best-effort; ignore failures
    }
  });
}

export function subscribeReliabilityEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recentReliabilityEvents(windowMs: number): ReliabilityEvent[] {
  const now = Date.now();
  prune(now);
  const cutoff = now - Math.max(0, windowMs);
  return events
    .filter((event) => event.timestamp >= cutoff)
    .map((event) => ({ ...event }));
}

export function __resetReliabilityEventsForTests(): void {
  events = [];
  listeners.clear();
}
