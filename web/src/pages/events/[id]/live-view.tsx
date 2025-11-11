import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { useLivePlayback } from '@web/features/live/useLivePlayback';
import { postTelemetryEvent } from '@web/api';
import { useMediaPlaybackTelemetry } from '@web/media/telemetry';
import { exchangeViewerInvite } from '@web/features/live/api';

export default function EventLiveViewerPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const eventId = params.id ?? '';
  const invite = searchParams.get('invite');
  const tokenParam = searchParams.get('token');
  const [token, setToken] = useState<string | null>(tokenParam);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);

  useEffect(() => {
    setToken(tokenParam);
  }, [tokenParam, eventId]);

  useEffect(() => {
    if (!eventId || !invite || tokenParam) {
      return;
    }
    let cancelled = false;
    setInvitePending(true);
    setInviteError(null);
    exchangeViewerInvite(eventId, invite)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setToken(response.token);
        setInviteError(null);
        void postTelemetryEvent({
          event: 'live.invite.exchange.ok',
          eventId,
        }).catch((error) => {
          if (import.meta.env.DEV) {
            console.warn('[live/viewer] telemetry failed', error);
          }
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to claim viewer invite. Ask host for a new link.';
        setInviteError(message);
        void postTelemetryEvent({
          event: 'live.invite.exchange.fail',
          eventId,
          reason: error instanceof Error ? error.message : 'unknown',
        }).catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[live/viewer] telemetry failed', err);
          }
        });
      })
      .finally(() => {
        if (!cancelled) {
          setInvitePending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, invite, tokenParam]);

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
        event: 'live.viewer_open',
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
    if (!token && !invite) {
      return <p className="text-sm text-rose-300">Viewer token missing. Ask the host for a new link.</p>;
    }
    if (invite && !token) {
      if (invitePending) {
        return <p className="text-sm text-slate-300">Preparing your live viewer session…</p>;
      }
      if (inviteError) {
        return <p className="text-sm text-rose-300">{inviteError}</p>;
      }
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
        data-testid="live-viewer-video"
        controls
        autoPlay
        playsInline
        src={playback.videoUrl}
      />
    );
  }, [invite, inviteError, invitePending, playback.loading, playback.running, playback.videoUrl, token]);

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
