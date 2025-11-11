import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

type ClipPlayerProps = {
  src?: string | null;
  anchors?: number[] | null;
  className?: string;
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
  { src, anchors, className }: ClipPlayerProps,
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

  const handleSeek = (target: number) => {
    if (!videoRef.current) return;
    try {
      videoRef.current.currentTime = target;
    } catch (err) {
      console.warn('Unable to seek clip', err);
    }
  };

  return (
    <div className={className}>
      <video ref={videoRef} controls className="w-full rounded bg-black" src={src ?? undefined} />
      {sanitizedAnchors.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Anchors:</span>
          {sanitizedAnchors.map((anchor) => (
            <button
              type="button"
              key={anchor}
              onClick={() => handleSeek(anchor)}
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
