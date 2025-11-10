import { useEffect, useMemo, useRef, useState } from 'react';

import { postClipCommentary } from '@web/api';

import { useEventSession } from '../events/EventSessionContext';
import type { ShotClip } from './types';

export type ClipModalProps = {
  clip: ShotClip;
  onClose?: () => void;
  onRefetch?: () => void | Promise<void>;
};

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
  const session = useEventSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const title = useMemo(() => resolveCommentaryField(clip.ai_title ?? clip.aiTitle), [clip]);
  const summary = useMemo(
    () => resolveCommentaryField(clip.ai_summary ?? clip.aiSummary),
    [clip],
  );
  const ttsUrl = useMemo(() => normalizeTtsUrl(clip), [clip]);

  useEffect(() => {
    setError(null);
    setLoading(false);
    setIsPlaying(false);
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

  const canRequest = session.role === 'admin';
  const hideCoachExtras = session.tournamentSafe && session.coachMode;

  const handleRequest = async () => {
    if (!clip.id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await postClipCommentary(clip.id);
      if (onRefetch) {
        await onRefetch();
      }
    } catch (err) {
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

      {clip.video_url ?? clip.videoUrl ? (
        <video controls className="w-full rounded bg-black" src={(clip.video_url ?? clip.videoUrl) ?? undefined} />
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

      {canRequest && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRequest}
            disabled={loading}
            className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
          >
            {loading ? 'Requesting…' : 'Request commentary'}
          </button>
          {error && <span className="text-sm text-rose-400">{error}</span>}
        </div>
      )}

      {!canRequest && error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}
    </div>
  );
}
