import * as React from 'react';

import { API, getApiKey, postTelemetryEvent } from '@web/api';
import PairWatchDialog from '@web/watch/PairWatchDialog';
import { useEventSession } from '@web/session/eventSession';
import { copyToClipboard } from '@web/utils/copy';

const POLL_MS = 5_000;
const HEARTBEAT_MS = 20_000;
const REFRESH_THRESHOLD_SEC = 35;
const WATCH_FEATURE_ENABLED = import.meta.env.VITE_FEATURE_WATCH === '1' || import.meta.env.DEV;

type LiveStateResponse = {
  isLive: boolean;
  viewerUrl: string | null;
  startedTs: number | null;
  updatedTs: number | null;
  streamId: string | null;
  latencyMode: string | null;
};

type Token = { url: string; expTs: number };

type Status = 'offline' | 'live' | 'starting' | 'stopping';

type RefreshResponse = { viewerUrl: string; expTs: number; refreshed: boolean };

function buildAuthHeaders(): HeadersInit {
  const apiKey = getApiKey();
  return apiKey ? { 'x-api-key': apiKey } : {};
}

function buildAdminHeaders(memberId: string | null | undefined, json = false): HeadersInit {
  const headers: Record<string, string> = { 'x-event-role': 'admin' };
  if (memberId) {
    headers['x-event-member'] = memberId;
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return { ...headers, ...buildAuthHeaders() };
}

async function fetchLiveState(eventId: string): Promise<LiveStateResponse> {
  const response = await fetch(`${API}/events/${eventId}/live`, {
    headers: buildAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`live state ${response.status}`);
  }
  return response.json();
}

async function mintViewerToken(eventId: string): Promise<Token> {
  const response = await fetch(`${API}/api/events/${eventId}/live/viewer-token`, {
    method: 'POST',
    headers: buildAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`mint viewer token ${response.status}`);
  }
  const payload: { viewerUrl: string; expTs: number } = await response.json();
  return { url: payload.viewerUrl, expTs: payload.expTs };
}

async function refreshViewerToken(eventId: string, expTs: number): Promise<RefreshResponse> {
  const url = new URL(`${API}/api/events/${eventId}/live/refresh`);
  url.searchParams.set('expTs', `${expTs}`);
  url.searchParams.set('minRemainingSec', '30');
  const response = await fetch(url.toString(), {
    headers: buildAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`refresh viewer token ${response.status}`);
  }
  return response.json();
}

async function sendHeartbeat(
  eventId: string,
  memberId: string | null,
  viewerUrl?: string | null,
  latencyMode?: string | null,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (viewerUrl) {
    body.viewerUrl = viewerUrl;
  }
  if (latencyMode) {
    body.latencyMode = latencyMode;
  }
  await fetch(`${API}/events/${eventId}/live/heartbeat`, {
    method: 'POST',
    headers: buildAdminHeaders(memberId, true),
    body: JSON.stringify(body),
  });
}

function emitHostTelemetry(event: string, payload: Record<string, unknown>): void {
  void postTelemetryEvent({
    event,
    ts: Date.now(),
    source: 'web',
    ...payload,
  }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[live/host] telemetry ${event} failed`, error);
    }
  });
}

export default function HostLiveWizard({ eventId }: { eventId: string }): JSX.Element | null {
  const session = useEventSession();
  const isAdmin = session.role === 'admin';
  const safe = session.safe;

  const [status, setStatus] = React.useState<Status>('offline');
  const [token, setToken] = React.useState<Token | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [remaining, setRemaining] = React.useState<number>(0);
  const [pairDialogOpen, setPairDialogOpen] = React.useState(false);

  const tokenRef = React.useRef<Token | null>(null);
  const refreshingRef = React.useRef(false);
  const viewerOriginRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  React.useEffect(() => {
    if (!isAdmin || safe) {
      setStatus('offline');
      setToken(null);
      setRemaining(0);
    }
  }, [isAdmin, safe]);

  React.useEffect(() => {
    if (!isAdmin || safe) {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const state = await fetchLiveState(eventId);
        if (cancelled) {
          return;
        }
        if (!state.isLive || !state.viewerUrl) {
          setStatus('offline');
          setToken(null);
          setRemaining(0);
        } else {
          setStatus('live');
          if (!tokenRef.current) {
            try {
              const minted = await mintViewerToken(eventId);
              if (!cancelled) {
                setToken(minted);
                setRemaining(
                  Math.max(0, minted.expTs - Math.floor(Date.now() / 1000)),
                );
                setError(undefined);
              }
            } catch (mintError) {
              if (!cancelled) {
                setError(
                  mintError instanceof Error
                    ? mintError.message
                    : 'Mint viewer token failed',
                );
              }
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Live state failed');
        }
      }

      if (!cancelled) {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [eventId, isAdmin, safe]);

  React.useEffect(() => {
    if (!token || !isAdmin || safe) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const remainingSec = token.expTs - now;
      setRemaining(Math.max(0, remainingSec));
      if (remainingSec < REFRESH_THRESHOLD_SEC && !refreshingRef.current) {
        refreshingRef.current = true;
        try {
          const refreshed = await refreshViewerToken(eventId, token.expTs);
          if (!cancelled && refreshed.refreshed) {
            setToken({ url: refreshed.viewerUrl, expTs: refreshed.expTs });
            setRemaining(
              Math.max(0, refreshed.expTs - Math.floor(Date.now() / 1000)),
            );
            emitHostTelemetry('live.viewer.refresh', {
              eventId,
              expTs: refreshed.expTs,
            });
            setError(undefined);
          }
        } catch (refreshError) {
          if (!cancelled) {
            setError(
              refreshError instanceof Error
                ? refreshError.message
                : 'Refresh viewer token failed',
            );
          }
        } finally {
          refreshingRef.current = false;
        }
      }
      timer = setTimeout(tick, 1_000);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [eventId, token, isAdmin, safe]);

  React.useEffect(() => {
    if (!isAdmin || safe || status !== 'live') {
      return;
    }
    let cancelled = false;

    async function beat() {
      try {
        await sendHeartbeat(eventId, session.memberId ?? null, viewerOriginRef.current);
      } catch (heartbeatError) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[live/host] heartbeat failed', heartbeatError);
        }
      }
    }

    void beat();
    const interval = setInterval(() => {
      if (!cancelled) {
        void beat();
      }
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, session.memberId, status, isAdmin, safe]);

  const handleStart = React.useCallback(async () => {
    setError(undefined);
    setStatus('starting');
    try {
      const response = await fetch(`${API}/events/${eventId}/live/start`, {
        method: 'POST',
        headers: buildAdminHeaders(session.memberId, true),
        body: JSON.stringify({ source: 'mock' }),
      });
      if (!response.ok) {
        throw new Error(`start live ${response.status}`);
      }
      const data: { hlsPath?: string | null } = await response.json();
      viewerOriginRef.current = data.hlsPath ?? null;
      await sendHeartbeat(eventId, session.memberId ?? null, viewerOriginRef.current);
      const minted = await mintViewerToken(eventId);
      setToken(minted);
      setRemaining(Math.max(0, minted.expTs - Math.floor(Date.now() / 1000)));
      setStatus('live');
    } catch (err) {
      setStatus('offline');
      setToken(null);
      setRemaining(0);
      setError(err instanceof Error ? err.message : 'Start live failed');
    }
  }, [eventId, session.memberId]);

  const handleStop = React.useCallback(async () => {
    setError(undefined);
    setStatus('stopping');
    try {
      const response = await fetch(`${API}/events/${eventId}/live/stop`, {
        method: 'POST',
        headers: buildAdminHeaders(session.memberId),
      });
      if (!response.ok) {
        throw new Error(`stop live ${response.status}`);
      }
      viewerOriginRef.current = null;
      setToken(null);
      setRemaining(0);
      setStatus('offline');
    } catch (err) {
      setStatus('live');
      setError(err instanceof Error ? err.message : 'Stop live failed');
    }
  }, [eventId, session.memberId]);

  const handleCopy = React.useCallback(() => {
    if (!token) {
      return;
    }
    void copyToClipboard(token.url);
    emitHostTelemetry('live.viewer.share', { eventId });
  }, [eventId, token]);

  const busy = status === 'starting' || status === 'stopping';

  if (!isAdmin || safe) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">Go Live</div>
        {status === 'live' ? (
          <button
            type="button"
            className="text-sm font-medium text-rose-300 hover:text-rose-200"
            onClick={handleStop}
            disabled={busy}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
            onClick={handleStart}
            disabled={busy}
          >
            Start
          </button>
        )}
      </div>

      {status === 'live' && token ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-black/30 px-2 py-1 text-xs uppercase tracking-wide text-slate-200">
              Viewer link
            </span>
            <button
              type="button"
              className="text-xs font-medium text-sky-300 hover:text-sky-200"
              onClick={handleCopy}
            >
              Copy
            </button>
          </div>
          <div className="break-all text-xs text-slate-300">{token.url}</div>
          <div className="text-xs text-slate-400">
            Token expires in <b>{Math.max(0, remaining)}s</b> (auto-refresh)
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Start streaming to mint a viewer URL and share instantly.</p>
      )}

      {error ? <div className="text-xs text-rose-400">Error: {error}</div> : null}

      {WATCH_FEATURE_ENABLED ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-emerald-300 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setPairDialogOpen(true)}
            disabled={!session.memberId}
          >
            Pair Watch
          </button>
        </div>
      ) : null}

      {WATCH_FEATURE_ENABLED ? (
        <PairWatchDialog
          open={pairDialogOpen}
          onClose={() => setPairDialogOpen(false)}
          memberId={session.memberId}
        />
      ) : null}
    </div>
  );
}
