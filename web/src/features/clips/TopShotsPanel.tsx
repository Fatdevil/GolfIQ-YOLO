import { useEffect, useMemo, useRef, useState } from "react";

import type { ShotClip } from "@web/features/clips/types";
import { cn } from "@web/lib/cn";

const ROW_HEIGHT = 88;

export type TopShotsPanelProps = {
  clips: ShotClip[];
  loading?: boolean;
  error?: string | null;
  onSelect?: (clip: ShotClip) => void;
  onReact?: (clip: ShotClip, emoji: string) => void | Promise<void>;
};

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) {
    return "--";
  }
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}:${remaining.toString().padStart(2, "0")}` : `${remaining}s`;
}

export default function TopShotsPanel({ clips, loading, error, onSelect, onReact }: TopShotsPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return () => undefined;
    }
    const handleScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", handleScroll);
    const resize = () => setContainerHeight(el.clientHeight);
    resize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [clips.length]);

  const virtual = useMemo(() => {
    const total = clips.length;
    const height = containerHeight || 320;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const visible = Math.max(1, Math.ceil(height / ROW_HEIGHT) + 2);
    const endIndex = Math.min(total, startIndex + visible);
    const slice = clips.slice(startIndex, endIndex);
    const offset = startIndex * ROW_HEIGHT;
    const paddingBottom = Math.max(0, (total - endIndex) * ROW_HEIGHT);
    return { items: slice, offset, paddingBottom };
  }, [clips, containerHeight, scrollTop]);

  if (loading && clips.length === 0) {
    return <div className="rounded-lg bg-slate-900 p-4 text-sm text-slate-300">Loading top shots…</div>;
  }

  if (error && clips.length === 0) {
    return (
      <div className="rounded-lg bg-slate-900 p-4 text-sm text-rose-300" role="alert">
        {error}
      </div>
    );
  }

  if (clips.length === 0) {
    return <div className="rounded-lg bg-slate-900 p-4 text-sm text-slate-300">No clips yet — be the first to share a shot!</div>;
  }

  return (
    <div className="rounded-lg bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Top Shots</h2>
        {loading && <span className="text-xs text-slate-400">Updating…</span>}
      </header>
      <div ref={containerRef} className="max-h-96 overflow-y-auto">
        <div style={{ height: clips.length * ROW_HEIGHT }}>
          <div style={{ transform: `translateY(${virtual.offset}px)` }}>
            {virtual.items.map((clip) => (
              <article
                key={clip.id}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3 transition-colors",
                  "border-b border-slate-800 last:border-b-0",
                  onSelect ? "hover:bg-slate-800 cursor-pointer" : "",
                )}
                onClick={() => onSelect?.(clip)}
              >
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded bg-slate-800">
                    {clip.thumbUrl ? (
                      <img src={clip.thumbUrl} alt="Clip thumbnail" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg">🎬</span>
                    )}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-slate-100">Hole {clip.hole ?? "—"}</span>
                    <span className="text-xs text-slate-400">
                      {clip.reactions.total} reactions · {formatDuration(clip.durationMs)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-300">{clip.weight.toFixed(1)}</span>
                  {onReact && (
                    <button
                      type="button"
                      className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onReact(clip, "🔥");
                      }}
                    >
                      🔥 {clip.reactions.counts["🔥"] ?? 0}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div style={{ height: virtual.paddingBottom }} />
        </div>
      </div>
    </div>
  );
}
