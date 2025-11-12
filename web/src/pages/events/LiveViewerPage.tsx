import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useLiveViewer } from '@web/features/live/useLiveViewer';
import { useCdnPreconnect } from '@web/media/cdn';

const DEFAULT_MAX_RETRIES = 3;

export default function LiveViewerPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const eventId = params.id ?? '';
  const thumb = searchParams.get('thumb');
  const pollMsParam = Number(searchParams.get('pollMs') ?? '');
  const backoffParam = Number(searchParams.get('backoffMs') ?? '');
  const stallMsParam = Number(searchParams.get('stallMs') ?? '');
  const viewer = useLiveViewer(eventId, {
    maxRetries: DEFAULT_MAX_RETRIES,
    pollMs: Number.isFinite(pollMsParam) && pollMsParam > 0 ? pollMsParam : undefined,
    baseBackoffMs: Number.isFinite(backoffParam) && backoffParam > 0 ? backoffParam : undefined,
    stallThresholdMs: Number.isFinite(stallMsParam) && stallMsParam >= 0 ? stallMsParam : undefined,
  });
  const { status, error, attempts, start: startViewer, stop: stopViewer } = viewer;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useCdnPreconnect();

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (videoRef.current === node) {
        return;
      }
      if (!node) {
        videoRef.current = null;
        stopViewer();
        return;
      }
      videoRef.current = node;
      if (eventId) {
        startViewer(node);
      }
    },
    [eventId, startViewer, stopViewer],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!eventId || !video) {
      return () => undefined;
    }
    startViewer(video);
    return () => {
      stopViewer();
    };
  }, [eventId, startViewer, stopViewer]);

  const handleRetry = useCallback(() => {
    stopViewer();
    startViewer(videoRef.current);
  }, [startViewer, stopViewer]);

  const handleBack = useCallback(() => {
    if (!eventId) {
      navigate('/');
      return;
    }
    navigate(`/event/${eventId}`);
  }, [eventId, navigate]);

  const headerStatus = useMemo(() => {
    switch (status) {
      case 'playing':
        return 'Stream is live.';
      case 'reconnecting':
        return `Reconnecting (${attempts}/${DEFAULT_MAX_RETRIES})…`;
      case 'offline':
        return 'Live stream is offline. Check back soon.';
      case 'error':
        return error ?? 'Unable to load live stream.';
      default:
        return 'Preparing stream…';
    }
  }, [attempts, error, status]);

  const overlay = useMemo(() => {
    switch (status) {
      case 'reconnecting':
        return (
          <div
            className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-6 py-12 text-center"
            data-testid="live-viewer-overlay"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-hidden="true" />
            <p className="text-sm text-slate-300">
              Reconnecting ({attempts}/{DEFAULT_MAX_RETRIES})…
            </p>
          </div>
        );
      case 'offline':
        return (
          <div
            className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-6 py-12 text-center"
            data-testid="live-viewer-overlay"
          >
            <p className="text-sm text-slate-300">Live stream is offline. Try again soon.</p>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
              aria-label="Back to event"
            >
              Back to event
            </button>
          </div>
        );
      case 'error':
        return (
          <div
            className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-xl border border-rose-700/40 bg-rose-950/40 px-6 py-12 text-center"
            data-testid="live-viewer-overlay"
          >
            <p className="text-sm text-rose-200">{error ?? 'Unable to load live stream.'}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500"
              aria-label="Retry"
            >
              Retry
            </button>
          </div>
        );
      default:
        return (
          <div
            className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-6 py-12 text-center"
            data-testid="live-viewer-overlay"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-hidden="true" />
            <p className="text-sm text-slate-300">Preparing stream…</p>
          </div>
        );
    }
  }, [attempts, error, handleBack, handleRetry, status]);

  if (!eventId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-3xl font-bold">Live Viewer</h1>
        <p className="text-sm text-rose-300">Event not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Live Viewer</h1>
        <p className="text-sm text-slate-300">{headerStatus}</p>
      </header>
      <div className="flex flex-col items-center gap-4">
        <video
          ref={setVideoRef}
          className={`w-full max-w-4xl rounded-xl border border-slate-800 bg-black shadow ${status === 'playing' ? '' : 'hidden'}`}
          controls
          autoPlay
          playsInline
          poster={thumb ?? undefined}
          data-testid="live-viewer-video"
        />
        {overlay}
      </div>
    </div>
  );
}
