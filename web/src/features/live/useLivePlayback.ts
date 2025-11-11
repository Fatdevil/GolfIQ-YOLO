import { useEffect, useMemo, useRef, useState } from 'react';

import { getSignedPlaybackUrl } from '@web/media/sign';
import { useEventSession } from '@web/session/eventSession';

import { getLiveStatus, mintViewerToken, type LiveStatusResponse } from './api';

export type LivePlaybackState = {
  running: boolean;
  videoUrl: string | null;
  hlsPath: string | null;
  loading: boolean;
  signed: boolean;
  token: string | null;
  error: string | null;
};

const EMPTY_STATE: LivePlaybackState = {
  running: false,
  videoUrl: null,
  hlsPath: null,
  loading: false,
  signed: false,
  token: null,
  error: null,
};

export type LivePlaybackOptions = {
  token?: string | null;
  pollMs?: number;
  immediate?: boolean;
};

function normalizeToken(input?: string | null): string | null {
  if (!input) {
    return null;
  }
  return input;
}

export function useLivePlayback(
  eventId: string | null | undefined,
  options: LivePlaybackOptions = {},
): LivePlaybackState {
  const session = useEventSession();
  const [state, setState] = useState<LivePlaybackState>({ ...EMPTY_STATE });
  const [token, setToken] = useState<string | null>(() => normalizeToken(options.token));
  const tokenRef = useRef<string | null>(token);
  const pollMs = options.pollMs ?? 5000;
  const immediate = options.immediate === true;

  useEffect(() => {
    const next = normalizeToken(options.token);
    setToken(next);
    tokenRef.current = next;
  }, [options.token, eventId]);

  useEffect(() => {
    if (!eventId) {
      setState({ ...EMPTY_STATE });
      return () => undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (immediate) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(run, Math.max(250, delay));
    };

    const ensureToken = async (): Promise<string | null> => {
      const current = tokenRef.current;
      if (current) {
        return current;
      }
      if (session.role !== 'admin') {
        return null;
      }
      if (!session.memberId) {
        return null;
      }
      try {
        const minted = await mintViewerToken(eventId, session.memberId);
        tokenRef.current = minted.token;
        setToken(minted.token);
        return minted.token;
      } catch (error) {
        return null;
      }
    };

    const run = async () => {
      if (cancelled) {
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: null }));

      let activeToken: string | null = tokenRef.current;
      if (!activeToken) {
        activeToken = await ensureToken();
        if (cancelled) {
          return;
        }
      }

      let status: LiveStatusResponse;
      try {
        status = await getLiveStatus(eventId, activeToken ?? undefined);
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'live_status_failed',
          }));
          schedule(pollMs * 2);
        }
        return;
      }

      if (cancelled) {
        return;
      }

      const running = Boolean(status.running);
      const hlsPath = running ? status.hlsPath ?? null : null;
      let videoUrl: string | null = null;
      let signed = false;

      if (running && hlsPath && activeToken) {
        try {
          const signedResult = await getSignedPlaybackUrl(hlsPath);
          if (cancelled) {
            return;
          }
          videoUrl = signedResult.url;
          signed = signedResult.signed;
        } catch (error) {
          if (!cancelled) {
            setState({
              running,
              hlsPath,
              videoUrl: null,
              loading: false,
              signed: false,
              token: activeToken,
              error: error instanceof Error ? error.message : 'sign_failed',
            });
          }
          schedule(running ? pollMs : pollMs * 2);
          return;
        }
      }

      setState({
        running,
        hlsPath,
        videoUrl,
        loading: false,
        signed,
        token: activeToken,
        error: null,
      });

      schedule(running ? pollMs : pollMs * 2);
    };

    if (immediate) {
      void run();
    } else {
      schedule(0);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [eventId, pollMs, session.memberId, session.role]);

  return useMemo(() => ({ ...state, token }), [state, token]);
}
