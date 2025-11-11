import { useEffect, useState } from 'react';

import { getLiveStatus, type LiveStatusResponse } from './api';

const EMPTY_STATUS: LiveStatusResponse = {
  running: false,
  startedAt: null,
  viewers: 0,
  hlsPath: null,
};

type UseLiveStatusOptions = {
  pollMs?: number;
};

export function useLiveStatus(
  eventId: string | null | undefined,
  options: UseLiveStatusOptions = {},
): LiveStatusResponse {
  const [status, setStatus] = useState<LiveStatusResponse>({ ...EMPTY_STATUS });
  const pollMs = Math.max(5000, options.pollMs ?? 10000);

  useEffect(() => {
    if (!eventId) {
      setStatus({ ...EMPTY_STATUS });
      return () => undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(run, Math.max(1000, delay));
    };

    const run = async () => {
      try {
        const payload = await getLiveStatus(eventId);
        if (cancelled) {
          return;
        }
        const next: LiveStatusResponse = {
          running: Boolean(payload.running),
          startedAt: payload.startedAt ?? null,
          viewers: typeof payload.viewers === 'number' ? payload.viewers : 0,
          hlsPath: payload.hlsPath ?? null,
        };
        setStatus(next);
        schedule(next.running ? pollMs : pollMs * 2);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus((prev) => ({ ...prev, running: false, hlsPath: null }));
        schedule(pollMs * 2);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [eventId, pollMs]);

  return status;
}
