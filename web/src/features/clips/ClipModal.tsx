import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';

import { postClipCommentary, postTelemetryEvent } from '@web/api';
import { useSignedVideoSource } from '@web/media/useSignedVideoSource';
import { useMediaPlaybackTelemetry } from '@web/media/telemetry';
import { measureStart } from '@web/metrics/playerTiming';

import { useEventSession, type EventSession } from '../../session/eventSession';
import type { ShotClip } from './types';
import { reportClip } from './moderationApi';
import { ClipPlayer } from './Player';

export type ClipModalProps = {
  clip: ShotClip;
  onClose?: () => void;
  onRefetch?: () => void | Promise<void>;
};

const TOURNAMENT_SAFE_MESSAGE = 'Tournament-safe: commentary disabled';

function resolveCommentaryField(value?: string | null): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function normalizeTtsUrl(clip: ShotClip): string | null {
  return clip.ai_tts_url ?? clip.aiTtsUrl ?? null;
}

export function ClipModal({ clip, onClose, onRefetch }: ClipModalProps): JSX.Element {
  const session = useEventSession() as EventSession & { tournamentSafe?: boolean; coachMode?: boolean };
  const { role, safe, memberId } = session;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const title = useMemo(() => resolveCommentaryField(clip.ai_title ?? clip.aiTitle), [clip]);
  const summary = useMemo(
    () => resolveCommentaryField(clip.ai_summary ?? clip.aiSummary),
    [clip],
  );
  const ttsUrl = useMemo(() => normalizeTtsUrl(clip), [clip]);
  const rawVideoUrl = useMemo(() => clip.video_url ?? clip.videoUrl ?? null, [clip]);
  const { url: signedVideoUrl, path: signedPath, signed: hasSignature, exp: signedExp, loading: signing } =
    useSignedVideoSource(rawVideoUrl);
  const poster = useMemo(
    () => clip.thumbUrl ?? clip.thumbnailUrl ?? clip.thumbnail_url ?? null,
    [clip],
  );

  useMediaPlaybackTelemetry(videoRef, {
    clipId: clip.id ?? null,
    runId: null,
    path: signedPath,
    signed: hasSignature,
    source: 'clip_modal',
    exp: signedExp,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedVideoUrl) {
      return () => undefined;
    }
    return measureStart(video, { live: false, src: signedVideoUrl }, (timing) => {
      void postTelemetryEvent({
        event: 'media.play.start',
        clipId: clip.id ?? null,
        path: signedPath,
        live: timing.live,
        playStartMs: timing.play_start_ms,
        src: timing.src,
        requestedAt: timing.reqTs,
        firstFrameTs: timing.firstFrameTs,
        source: 'clip_modal',
      }).catch((error) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[clip/modal] play-start telemetry failed', error);
        }
      });
    });
  }, [clip.id, signedPath, signedVideoUrl]);

  useEffect(() => {
    setError(null);
    setLoading(false);
    setIsPlaying(false);
    setReportError(null);
    setReportSubmitted(false);
    setReporting(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (!ttsUrl) {
      return () => undefined;
    }
    const audio = new Audio(ttsUrl);
    audioRef.current = audio;
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, [ttsUrl]);

  const isAdmin = role === 'admin';
  const canRequest = isAdmin && !safe;
  const isHidden = Boolean(clip.hidden);
  const visibility = clip.visibility ?? 'public';
  const hasMember = Boolean(memberId);
  const lacksVisibilityAccess =
    !isAdmin && visibility !== 'public' && (visibility === 'private' ? true : !hasMember);
  const hideCoachExtras = Boolean(session.tournamentSafe && session.coachMode);
  const banners: string[] = [];
  if (safe || error === TOURNAMENT_SAFE_MESSAGE) {
    banners.push(TOURNAMENT_SAFE_MESSAGE);
  }
  if (isHidden) {
    banners.push('Hidden by moderation');
  }
  if (lacksVisibilityAccess) {
    banners.push('Not visible to you');
  }

  const handleRequest = async () => {
    if (!clip.id || !isAdmin) {
      return;
    }
    if (!canRequest) {
      setError(TOURNAMENT_SAFE_MESSAGE);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await postClipCommentary(clip.id, memberId ?? undefined);
      if (onRefetch) {
        await onRefetch();
      }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 423) {
        setError(TOURNAMENT_SAFE_MESSAGE);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to request commentary';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAudio = async () => {
    if (!audioRef.current) {
      return;
    }
    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to play audio';
      setError(message);
    }
  };

  const handleReportClip = async () => {
    if (!clip.id || isAdmin || reporting || reportSubmitted) {
      return;
    }
    setReporting(true);
    setReportError(null);
    try {
      await reportClip(clip.id, {
        reason: 'user_report',
        reporter: memberId ?? null,
      });
      setReportSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to report clip';
      setReportError(message);
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Clip commentary</h2>
          {summary && <p className="text-sm text-slate-400">Auto-generated spectator summary</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200">
            Close
          </button>
        )}
      </header>

      {signedVideoUrl ? (
        <ClipPlayer
          ref={videoRef}
          clipId={clip.id ?? null}
          src={signedVideoUrl}
          anchors={clip.anchors ?? null}
          poster={poster}
        />
      ) : rawVideoUrl && signing ? (
        <div className="flex h-48 w-full items-center justify-center rounded border border-dashed border-slate-700 text-slate-500">
          Preparing video…
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center rounded border border-dashed border-slate-700 text-slate-500">
          Video unavailable
        </div>
      )}

      <div className="flex flex-col gap-2 rounded bg-slate-900 p-4">
        {title && <h3 className="text-lg font-semibold text-slate-100">{title}</h3>}
        {summary && <p className="text-sm leading-relaxed text-slate-300">{summary}</p>}
        {!title && !summary && <p className="text-sm text-slate-400">No commentary generated yet.</p>}
        {ttsUrl && (
          <button
            type="button"
            onClick={handleToggleAudio}
            className="self-start rounded bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            {isPlaying ? 'Pause voice-over' : 'Play voice-over'}
          </button>
        )}
        {hideCoachExtras && (
          <p className="text-xs text-slate-500">
            Tournament-safe mode active — showing spectator commentary only.
          </p>
        )}
      </div>

      {banners.map((message) => (
        <div
          key={message}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
        >
          {message}
        </div>
      ))}

      {canRequest ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRequest}
            disabled={loading}
            aria-label="Request commentary"
            className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
          >
            {loading ? 'Requesting…' : 'Request commentary'}
          </button>
          {error && error !== TOURNAMENT_SAFE_MESSAGE && (
            <span className="text-sm text-rose-400">{error}</span>
          )}
        </div>
      ) : null}

      {!isAdmin && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={handleReportClip}
            disabled={reporting || reportSubmitted}
            className="text-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {reportSubmitted ? 'Reported' : reporting ? 'Reporting…' : 'Report clip'}
          </button>
          {reportError && <span className="text-rose-400">{reportError}</span>}
        </div>
      )}
    </div>
  );
}
