import { useEffect, useMemo, useState } from 'react';

import { fetchBoard } from '@app/api/events';
import { safeEmit } from '@app/telemetry';
import { createBackoffController } from '@shared/events/resync';
import type { SpectatorBoardPlayer } from '@shared/events/types';

type LiveBoardState = {
  players: SpectatorBoardPlayer[];
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
};

const initialState: LiveBoardState = {
  players: [],
  updatedAt: null,
  loading: true,
  error: null,
};

export function useLiveBoard(eventId: string | null | undefined): LiveBoardState {
  const [state, setState] = useState<LiveBoardState>(initialState);
  const eventKey = useMemo(() => eventId ?? null, [eventId]);

  useEffect(() => {
    if (!eventKey) {
      setState(initialState);
      return;
    }
    let cancelled = false;
    const backoff = createBackoffController({ baseMs: 1000, successMs: 1000, successMaxMs: 1500, maxMs: 10000 });
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const started = Date.now();
      try {
        const snapshot = await fetchBoard(eventKey);
        if (cancelled) {
          return;
        }
        setState({
          players: Array.isArray(snapshot.players) ? snapshot.players : [],
          updatedAt: snapshot.updatedAt ?? null,
          loading: false,
          error: null,
        });
        const elapsed = Date.now() - started;
        safeEmit('events.live_tick_ms.mobile', { eventId: eventKey, ms: elapsed });
        const delay = backoff.success();
        timer = setTimeout(poll, delay);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unable to refresh live board';
        setState((prev) => ({ ...prev, loading: false, error: message }));
        const delay = backoff.failure();
        safeEmit('events.resync.mobile', {
          eventId: eventKey,
          delayMs: delay,
          attempt: backoff.attempts(),
          reason: message,
        });
        timer = setTimeout(poll, delay);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      backoff.reset();
    };
  }, [eventKey]);

  return state;
}
