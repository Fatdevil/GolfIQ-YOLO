import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  createViewerLink,
  getLiveStatus,
  startLive,
  stopLive,
  type LiveStatusResponse,
} from '@web/features/live/api';
import { useEventSession } from '@web/session/eventSession';

export default function EventLiveHostPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const session = useEventSession();
  const [status, setStatus] = useState<LiveStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerLink, setViewerLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = session.role === 'admin';
  const controlsDisabled = session.safe;

  useEffect(() => {
    if (!eventId) {
      return;
    }
    let cancelled = false;
    getLiveStatus(eventId)
      .then((payload) => {
        if (!cancelled) {
          setStatus({
            running: Boolean(payload.running),
            startedAt: payload.startedAt ?? null,
            viewers: typeof payload.viewers === 'number' ? payload.viewers : 0,
            hlsPath: payload.hlsPath ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const running = status?.running === true;
  const startedAt = status?.startedAt ? new Date(status.startedAt) : null;

  const handleStart = useCallback(async () => {
    if (!eventId || !isAdmin || controlsDisabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await startLive(eventId, session.memberId);
      setStatus({
        running: true,
        startedAt: payload.startedAt,
        viewers: 0,
        hlsPath: payload.hlsPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start live stream';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [controlsDisabled, eventId, isAdmin, session.memberId]);

  const handleStop = useCallback(async () => {
    if (!eventId || !isAdmin || controlsDisabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await stopLive(eventId, session.memberId);
      setStatus({ running: false, startedAt: null, viewers: 0, hlsPath: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop live stream';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [controlsDisabled, eventId, isAdmin, session.memberId]);

  const handleCopyViewerLink = useCallback(async () => {
    if (!eventId || !isAdmin || controlsDisabled) {
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const created = await createViewerLink(eventId, session.memberId);
      const link = created.url;
      setViewerLink(link);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to copy viewer link';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [controlsDisabled, eventId, isAdmin, session.memberId]);

  const viewerCount = status?.viewers ?? 0;
  const statusLabel = useMemo(() => {
    if (!running) {
      return 'Live stream is stopped';
    }
    if (startedAt) {
      return `Live since ${startedAt.toLocaleTimeString()} · ${viewerCount} watching`;
    }
    return `Live stream running · ${viewerCount} watching`;
  }, [running, startedAt, viewerCount]);

  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-3xl font-bold">Live Host</h1>
        <p className="text-sm text-slate-300">Admin access required to manage live streams.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Live Host Controls</h1>
        <p className="text-sm text-slate-300">{statusLabel}</p>
        {controlsDisabled && (
          <p className="text-xs text-amber-300">Live controls are disabled in tournament safe mode.</p>
        )}
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </header>
      {!controlsDisabled ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-900"
            onClick={handleStart}
            disabled={loading || running}
          >
            Start Stream
          </button>
          <button
            type="button"
            className="rounded bg-slate-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-900"
            onClick={handleStop}
            disabled={loading || !running}
          >
            Stop Stream
          </button>
          <button
            type="button"
            className="rounded bg-sky-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-sky-900"
            onClick={handleCopyViewerLink}
            disabled={loading || !running}
          >
            Copy Viewer Link
          </button>
        </div>
      ) : null}
      {viewerLink && (
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-200">Viewer link</p>
          <p className="break-all text-sm text-slate-300">{viewerLink}</p>
          <p className="mt-2 text-xs text-slate-500">
            {copied ? 'Viewer link copied!' : 'Use the copy button to share the link.'}
          </p>
        </div>
      )}
    </div>
  );
}
