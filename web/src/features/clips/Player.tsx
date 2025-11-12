import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { useAttachVideoSource } from '@web/player/useAttachVideoSource';
import type { PlayerOpenDetail } from '@web/player/seek';

type ClipPlayerProps = {
  clipId?: string | null;
  src?: string | null;
  anchors?: number[] | null;
  className?: string;
  poster?: string | null;
  live?: boolean;
};

function formatAnchorLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0s';
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${minutes}m ${remainder}s`;
  }
  return `${Math.round(seconds * 10) / 10}s`;
}

export const ClipPlayer = forwardRef<HTMLVideoElement | null, ClipPlayerProps>(function ClipPlayer(
  { clipId, src, anchors, className, poster, live = false }: ClipPlayerProps,
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useImperativeHandle<HTMLVideoElement | null, HTMLVideoElement | null>(
    forwardedRef,
    () => videoRef.current,
  );

  const sanitizedAnchors = useMemo(() => {
    if (!Array.isArray(anchors)) {
      return [];
    }
    return anchors
      .map((value) => {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? num : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
  }, [anchors]);

  const seekWhenReady = (targetSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      try {
        video.currentTime = targetSeconds;
      } catch (err) {
        console.warn('Unable to seek clip', err);
      }
    };
    apply();
    if (video.readyState >= 1) {
      return;
    }
    const handler = () => {
      video.removeEventListener('loadedmetadata', handler);
      apply();
    };
    video.addEventListener('loadedmetadata', handler);
  };

  useAttachVideoSource({ videoRef, src, live });

  // Handle direct navigation via query parameter (?clip=...&t=ms)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clipId) {
      return undefined;
    }
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      const clipParam = params.get('clip');
      const seekParam = params.get('t');
      if (clipParam && clipParam === clipId && seekParam) {
        const parsed = Number.parseInt(seekParam, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          seekWhenReady(parsed / 1000);
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('Failed to parse clip seek params', err);
      }
    }
    return undefined;
  }, [clipId, src]);

  useEffect(() => {
    if (!clipId) {
      return undefined;
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PlayerOpenDetail>).detail;
      if (!detail || detail.clipId !== clipId) {
        return;
      }
      seekWhenReady((detail.tMs ?? 0) / 1000);
    };
    window.addEventListener('player:open', handler as EventListener);
    return () => {
      window.removeEventListener('player:open', handler as EventListener);
    };
  }, [clipId]);

  return (
    <div className={className}>
      <video
        ref={videoRef}
        controls
        className="w-full rounded bg-black"
        poster={poster ?? undefined}
        preload="metadata"
      />
      {sanitizedAnchors.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Anchors:</span>
          {sanitizedAnchors.map((anchor) => (
            <button
              type="button"
              key={anchor}
              onClick={() => seekWhenReady(anchor)}
              className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              {formatAnchorLabel(anchor)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
