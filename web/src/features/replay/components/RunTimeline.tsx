import type { HudRecenterInterval, HudTimelineSegment } from "../utils/parseHudRun";

const STATE_COLORS: Record<string, string> = {
  AIM: "bg-amber-500/70",
  CALIBRATE: "bg-sky-500/70",
  TRACK: "bg-emerald-500/70",
  RECENTER: "bg-fuchsia-500/70",
};

interface RunTimelineProps {
  segments: HudTimelineSegment[];
  totalDurationMs: number;
  recenterIntervals?: HudRecenterInterval[];
}

export function RunTimeline({ segments, totalDurationMs, recenterIntervals = [] }: RunTimelineProps) {
  const total = totalDurationMs > 0 ? totalDurationMs : segments[segments.length - 1]?.endMs ?? 0;
  const baseStart = segments.length ? segments[0].startMs : 0;

  if (!segments.length || total <= 0) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        Timeline unavailable — no frame states recorded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
        <span>Timeline</span>
        <span>{(total / 1000).toFixed(1)}s</span>
      </div>
      <div className="relative h-8 overflow-hidden rounded bg-slate-800">
        {segments.map((segment, index) => {
          const duration = segment.endMs - segment.startMs;
          if (duration <= 0 || total <= 0) {
            return null;
          }
          const width = Math.max(0.5, (duration / total) * 100);
          return (
            <div
              key={`${segment.state}-${index}`}
              className={`absolute top-0 h-full ${STATE_COLORS[segment.state] ?? "bg-slate-600"}`}
              style={{
                left: `${((segment.startMs - baseStart) / total) * 100}%`,
                width: `${width}%`,
              }}
              title={`${segment.state} ${(duration / 1000).toFixed(2)}s`}
            />
          );
        })}
        {recenterIntervals.map((interval, index) => {
          const duration = interval.endMs - interval.startMs;
          if (duration <= 0 || total <= 0) {
            return null;
          }
          return (
            <div
              key={`recenter-${index}`}
              className="absolute top-0 h-full bg-fuchsia-300/30"
              style={{
                left: `${((interval.startMs - baseStart) / total) * 100}%`,
                width: `${Math.max(0.5, (duration / total) * 100)}%`,
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        {Object.entries(STATE_COLORS).map(([state, color]) => (
          <span key={state} className="inline-flex items-center gap-2">
            <span className={`h-3 w-3 rounded ${color}`} aria-hidden />
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}
