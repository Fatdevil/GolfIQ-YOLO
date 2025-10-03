import { useMemo } from "react";
import {
  GhostFrame,
  TraceData,
  mapPointToCanvas,
  getBounds,
  Bounds,
  formatTimestamp,
} from "../lib/traceUtils";

interface GhostFramesProps {
  frames?: GhostFrame[];
  trace?: TraceData;
  className?: string;
}

const mergeClassNames = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");

const isNormalized = (trace?: TraceData) =>
  Boolean(
    trace?.normalized ??
      (trace?.points?.length
        ? trace.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
        : false)
  );

export default function GhostFrames({ frames, trace, className }: GhostFramesProps) {
  const baseWidth = trace?.width || 1280;
  const baseHeight = trace?.height || 720;

  const { markers, normalized } = useMemo(() => {
    if (!frames?.length) {
      return { markers: [] as Array<{
        x: number;
        y: number;
        label: string;
        timestamp?: string;
      }>, normalized: isNormalized(trace) };
    }

    const normalizedTrace = isNormalized(trace);
    const bounds: Bounds = trace?.points?.length
      ? normalizedTrace
        ? { minX: 0, maxX: 1, minY: 0, maxY: 1 }
        : getBounds(trace.points)
      : { minX: 0, maxX: 1, minY: 0, maxY: 1 };

    const pointCount = trace?.points?.length ?? 0;

    const markers = frames.map((frame, index) => {
      let pointCandidate = null;
      if (frame.position && typeof frame.position === "object") {
        const { x, y } = frame.position as { x?: number; y?: number };
        if (typeof x === "number" && typeof y === "number") {
          pointCandidate = { x, y };
        }
      }
      const fallbackIndex =
        typeof frame.frameIndex === "number"
          ? frame.frameIndex
          : typeof frame.index === "number"
          ? frame.index
          : typeof frame.sampleIndex === "number"
          ? frame.sampleIndex
          : Math.round(((index + 1) / (frames.length + 1)) * Math.max(pointCount - 1, 0));

      if (!pointCandidate && trace?.points && pointCount > 0) {
        const clamped = Math.min(Math.max(fallbackIndex, 0), pointCount - 1);
        pointCandidate = trace.points[clamped];
      }

      const mappedPoint = pointCandidate
        ? mapPointToCanvas(pointCandidate, baseWidth, baseHeight, bounds, normalizedTrace)
        : {
            x: ((index + 1) / (frames.length + 1)) * baseWidth,
            y: baseHeight * 0.82,
          };

      return {
        x: mappedPoint.x,
        y: mappedPoint.y,
        label: frame.label,
        timestamp: formatTimestamp(frame.timestampMs),
      };
    });

    return { markers, normalized: normalizedTrace };
  }, [frames, trace, baseWidth, baseHeight]);

  if (!markers.length) {
    return null;
  }

  return (
    <svg
      className={mergeClassNames("pointer-events-none h-full w-full", className)}
      viewBox={`0 0 ${baseWidth} ${baseHeight}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {markers.map((marker, index) => (
        <g key={`${marker.label}-${index}`} opacity={0.6}>
          <circle
            cx={marker.x}
            cy={marker.y}
            r={Math.max(baseWidth, baseHeight) / 120}
            fill="#ffffff"
            fillOpacity={0.08}
            stroke="#94a3b8"
            strokeOpacity={0.3}
          />
          <text
            x={marker.x}
            y={marker.y - Math.max(baseHeight / 18, 16)}
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize={Math.max(baseHeight / 48, 11)}
            fontWeight={600}
            style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {marker.label}
          </text>
          {marker.timestamp && (
            <text
              x={marker.x}
              y={marker.y - Math.max(baseHeight / 35, 12)}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={Math.max(baseHeight / 60, 10)}
            >
              {marker.timestamp}
            </text>
          )}
        </g>
      ))}

      <metadata>{JSON.stringify({ normalized, count: markers.length })}</metadata>
    </svg>
  );
}
