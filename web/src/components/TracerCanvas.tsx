import { useMemo } from "react";
import { TraceData, createSmoothPath, getBounds, Bounds } from "../lib/traceUtils";

interface TracerCanvasProps {
  trace?: TraceData;
  className?: string;
  highlightApex?: boolean;
  highlightLanding?: boolean;
  fallback?: React.ReactNode;
}

const mergeClassNames = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");

export default function TracerCanvas({
  trace,
  className,
  highlightApex = true,
  highlightLanding = true,
  fallback = null,
}: TracerCanvasProps) {
  const { path, mappedPoints, bounds, normalized } = useMemo(() => {
    if (!trace || !trace.points?.length) {
      return { path: "", mappedPoints: [] as { x: number; y: number }[], bounds: getBounds([]), normalized: false };
    }
    const baseWidth = trace.width || 1280;
    const baseHeight = trace.height || 720;
    const { path, mapped, bounds, normalized } = createSmoothPath(
      trace.points,
      baseWidth,
      baseHeight,
      0.2,
      undefined,
      trace.normalized
    );
    return { path, mappedPoints: mapped, bounds, normalized };
  }, [trace]);

  const baseWidth = trace?.width || 1280;
  const baseHeight = trace?.height || 720;

  const apexPoint = useMemo(() => {
    if (!trace || trace.apexIndex === undefined) return undefined;
    const index = Math.min(Math.max(trace.apexIndex, 0), (trace.points?.length ?? 1) - 1);
    const mapped = mappedPoints[index];
    if (!mapped) return undefined;
    return { index, mapped };
  }, [trace, mappedPoints]);

  const landingPoint = useMemo(() => {
    if (!trace || trace.landingIndex === undefined) return undefined;
    const index = Math.min(Math.max(trace.landingIndex, 0), (trace.points?.length ?? 1) - 1);
    const mapped = mappedPoints[index];
    if (!mapped) return undefined;
    return { index, mapped };
  }, [trace, mappedPoints]);

  if (!trace || !trace.points?.length) {
    return (
      <div
        className={mergeClassNames(
          "flex h-full w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-xs text-slate-400",
          className
        )}
      >
        {fallback ?? "Tracer data unavailable"}
      </div>
    );
  }

  const overlayViewBox = `0 0 ${baseWidth} ${baseHeight}`;

  const sampleBounds: Bounds = bounds;

  const startPoint = mappedPoints[0] ?? { x: 0, y: 0 };
  const endPoint = mappedPoints[mappedPoints.length - 1] ?? startPoint;

  return (
    <svg
      className={mergeClassNames("pointer-events-none h-full w-full", className)}
      viewBox={overlayViewBox}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="flightTrail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.9} />
          <stop offset="50%" stopColor="#34d399" stopOpacity={0.8} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.6} />
        </linearGradient>
        <radialGradient id="landingMarker" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
        </radialGradient>
      </defs>

      <rect
        x={0}
        y={0}
        width={baseWidth}
        height={baseHeight}
        fill="url(#checker)"
        opacity={0}
      />

      <path d={path} fill="none" stroke="url(#flightTrail)" strokeWidth={Math.max(baseWidth, baseHeight) / 320} strokeLinecap="round" />

      {highlightApex && apexPoint && (
        <g>
          <circle cx={apexPoint.mapped.x} cy={apexPoint.mapped.y} r={Math.max(baseWidth, baseHeight) / 90} fill="#facc15" opacity={0.85} />
          <text
            x={apexPoint.mapped.x}
            y={apexPoint.mapped.y - Math.max(baseHeight / 30, 12)}
            textAnchor="middle"
            fill="#facc15"
            fontSize={Math.max(baseHeight / 45, 10)}
            className="drop-shadow"
          >
            Apex
          </text>
        </g>
      )}

      {highlightLanding && landingPoint && (
        <g>
          <circle cx={landingPoint.mapped.x} cy={landingPoint.mapped.y} r={Math.max(baseWidth, baseHeight) / 80} fill="url(#landingMarker)" />
          <text
            x={landingPoint.mapped.x}
            y={landingPoint.mapped.y - Math.max(baseHeight / 25, 14)}
            textAnchor="middle"
            fill="#f97316"
            fontSize={Math.max(baseHeight / 45, 10)}
            className="drop-shadow"
          >
            Landing
          </text>
        </g>
      )}

      <g opacity={0.25}>
        <circle cx={startPoint.x} cy={startPoint.y} r={Math.max(baseWidth, baseHeight) / 140} fill="#22d3ee" />
        <circle cx={endPoint.x} cy={endPoint.y} r={Math.max(baseWidth, baseHeight) / 160} fill="#f97316" />
      </g>

      <metadata>
        {JSON.stringify({
          bounds: sampleBounds,
          normalized,
          apexIndex: trace.apexIndex,
          landingIndex: trace.landingIndex,
        })}
      </metadata>
    </svg>
  );
}
