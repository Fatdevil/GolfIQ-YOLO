import { useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { useLivePlayback } from '@web/features/live/useLivePlayback';
import { postTelemetryEvent } from '@web/api';
import { useMediaPlaybackTelemetry } from '@web/media/telemetry';

export default function EventLiveViewerPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const eventId = params.id ?? '';
  const token = searchParams.get('token');

  const playback = useLivePlayback(eventId || null, { token });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const emittedRef = useRef(false);

  useMediaPlaybackTelemetry(videoRef, {
    clipId: null,
    runId: null,
    path: playback.hlsPath,
    signed: playback.signed,
    source: 'live',
    exp: null,
  });

  useEffect(() => {
    if (token && playback.running && playback.videoUrl && !emittedRef.current) {
      emittedRef.current = true;
      void postTelemetryEvent({
        event: 'live.viewer_join',
        eventId,
        signed: playback.signed,
        path: playback.hlsPath,
      }).catch((error) => {
        if (import.meta.env.DEV) {
          console.warn('[live/viewer] telemetry failed', error);
        }
      });
    }
  }, [eventId, playback.hlsPath, playback.running, playback.signed, playback.videoUrl, token]);

  const content = useMemo(() => {
    if (!token) {
      return <p className="text-sm text-rose-300">Viewer token missing. Ask the host for a new link.</p>;
    }
    if (playback.loading) {
      return <p className="text-sm text-slate-300">Checking live status…</p>;
    }
    if (!playback.running) {
      return <p className="text-sm text-slate-300">Live stream is offline. Try again soon.</p>;
    }
    if (!playback.videoUrl) {
      return <p className="text-sm text-rose-300">Unable to load video. Please refresh or request a new link.</p>;
    }
    return (
      <video
        ref={videoRef}
        className="w-full rounded-lg border border-slate-800 bg-black"
        controls
        autoPlay
        playsInline
        src={playback.videoUrl}
      />
    );
  }, [playback.loading, playback.running, playback.videoUrl, token]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Live Tee Cam</h1>
        <p className="text-sm text-slate-300">
          {playback.running ? 'Stream ready for playback.' : 'Waiting for the host to go live.'}
        </p>
      </header>
      {content}
    </div>
  );
}
