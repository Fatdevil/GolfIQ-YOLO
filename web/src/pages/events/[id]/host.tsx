import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  fetchHostState,
  patchEventSettings,
  postEventClose,
  postEventPause,
  postEventRegenerateCode,
  postEventStart,
  type HostStateResponse,
  type UpdateEventSettingsBody,
} from '@web/api';
import { emitEventsHostAction } from '@shared/events/telemetry';
import type { GrossNetMode, TvFlags, UUID } from '@shared/events/types';

const HOST_MEMBER_ID_KEY = 'events.host.memberId';

type NormalizedTvFlags = {
  showQrOverlay: boolean;
  autoRotateTop: boolean;
  rotateIntervalMs?: number;
};

function resolveHostMemberId(): string {
  if (typeof window === 'undefined') {
    return 'host';
  }
  const existing = window.localStorage.getItem(HOST_MEMBER_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  const fallback = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `host-${Date.now()}`;
  window.localStorage.setItem(HOST_MEMBER_ID_KEY, fallback);
  return fallback;
}

function sanitizeTvFlags(flags: TvFlags | null | undefined): NormalizedTvFlags {
  return {
    showQrOverlay: !!flags?.showQrOverlay,
    autoRotateTop: flags?.autoRotateTop !== false,
    rotateIntervalMs: flags?.rotateIntervalMs ?? undefined,
  };
}

export default function EventHostPanel(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const memberIdRef = useRef<string>(resolveHostMemberId());
  const [state, setState] = useState<HostStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async <T,>(task: () => Promise<T>, action?: string): Promise<T | null> => {
    if (!eventId) {
      setError('Missing event id');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await task();
      if (action) {
        emitEventsHostAction({
          eventId: eventId as UUID,
          action,
          memberId: memberIdRef.current,
        });
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Host action failed';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!eventId) {
      return;
    }
    try {
      const next = await fetchHostState(eventId, memberIdRef.current);
      setState(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load host panel';
      setError(message);
    }
  };

  useEffect(() => {
    if (!eventId) {
      return;
    }
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const joinUrl = useMemo(() => state?.joinUrl ?? '', [state]);
  const tvFlags = sanitizeTvFlags(state?.tvFlags);
  const grossNet: GrossNetMode = state?.grossNet ?? 'net';

  const copyLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Copy failed';
      setError(message);
    }
  };

  const updateSettings = async (body: UpdateEventSettingsBody, actionLabel: string) => {
    const next = await run(
      async () => patchEventSettings(eventId, body, memberIdRef.current),
      actionLabel,
    );
    if (next) {
      setState(next);
    }
  };

  const handleStart = async () => {
    const next = await run(() => postEventStart(eventId, memberIdRef.current), 'start');
    if (next) setState(next);
  };

  const handlePause = async () => {
    const next = await run(() => postEventPause(eventId, memberIdRef.current), 'pause');
    if (next) setState(next);
  };

  const handleClose = async () => {
    const next = await run(() => postEventClose(eventId, memberIdRef.current), 'close');
    if (next) setState(next);
  };

  const handleRegenerate = async () => {
    const next = await run(() => postEventRegenerateCode(eventId, memberIdRef.current), 'code.regenerate');
    if (next) setState(next);
  };

  const toggleGrossNet = async () => {
    const nextMode: GrossNetMode = grossNet === 'gross' ? 'net' : 'gross';
    await updateSettings({ grossNet: nextMode }, `grossNet.${nextMode}`);
  };

  const toggleQrOverlay = async () => {
    await updateSettings({ tvFlags: { ...tvFlags, showQrOverlay: !tvFlags.showQrOverlay } }, 'tv.qr');
  };

  const toggleAutoRotate = async () => {
    await updateSettings({ tvFlags: { ...tvFlags, autoRotateTop: !tvFlags.autoRotateTop } }, 'tv.rotate.toggle');
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Host Controls</h1>
        {state && (
          <p className="text-sm text-slate-300">
            Event <span className="font-semibold text-slate-100">{state.name}</span> · Status{' '}
            <span className="font-semibold text-teal-300">{state.status.toUpperCase()}</span>
          </p>
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </header>

      <section className="grid gap-4 rounded-lg bg-slate-900 p-6 shadow md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Event actions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStart}
              className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
              disabled={loading}
            >
              Start event
            </button>
            <button
              type="button"
              onClick={handlePause}
              className="rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
              disabled={loading}
            >
              Pause event
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded bg-rose-600 px-3 py-2 text-sm font-semibold text-slate-50 hover:bg-rose-500 disabled:opacity-60"
              disabled={loading}
            >
              Close event
            </button>
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            className="inline-flex w-max items-center justify-center rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400 disabled:opacity-60"
            disabled={loading}
          >
            Regenerate join code
          </button>
          <div className="mt-2 flex flex-col gap-1 text-sm text-slate-300">
            <span>Participants: {state?.participants ?? 0}</span>
            <span>Spectators: {state?.spectators ?? 0}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Leaderboard display</h2>
          <button
            type="button"
            onClick={toggleGrossNet}
            className="inline-flex w-max items-center justify-center rounded border border-teal-400 px-3 py-2 text-sm font-semibold text-teal-300 hover:bg-teal-400 hover:text-slate-950 disabled:opacity-60"
            disabled={loading}
          >
            Showing {grossNet === 'gross' ? 'Gross' : 'Net'} · Toggle
          </button>
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={tvFlags.showQrOverlay}
              onChange={toggleQrOverlay}
              disabled={loading}
              className="h-4 w-4"
            />
            Show QR on TV
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={tvFlags.autoRotateTop}
              onChange={toggleAutoRotate}
              disabled={loading}
              className="h-4 w-4"
            />
            Auto-rotate Top-N
          </label>
        </div>
      </section>

      <section className="grid gap-6 rounded-lg bg-slate-900 p-6 shadow md:grid-cols-[1fr_minmax(180px,220px)]">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Join link</h2>
          <p className="text-sm text-slate-300">Share with players and spectators.</p>
          <p className="text-sm font-mono text-slate-200">Code: {state?.code ?? '—'}</p>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex w-max items-center justify-center rounded border border-teal-400 px-3 py-2 text-sm font-semibold text-teal-300 hover:bg-teal-400 hover:text-slate-950 disabled:opacity-60"
            disabled={loading || !joinUrl}
          >
            {copied ? 'Link copied!' : 'Copy join link'}
          </button>
          <p className="break-words text-xs text-slate-400">{joinUrl}</p>
        </div>
        <div className="flex items-center justify-center">
          {state?.qrSvg ? (
            <div
              className="rounded-lg bg-white p-4 shadow-inner"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: state.qrSvg ?? '' }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-700 px-6 py-10 text-center text-sm text-slate-400">
              QR code will appear once generated.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
