import React from "react";

import type { SprayBin } from "./games";

type SprayHeatmapProps = {
  bins: SprayBin[];
};

const SVG_WIDTH = 320;
const SVG_HEIGHT = 240;
const PADDING = 36;

const axisColor = "#475569";

const parseIndex = (key: string): { ix: number; iy: number } | null => {
  const [ixRaw, iyRaw] = key.split(":");
  const ix = Number.parseInt(ixRaw ?? "", 10);
  const iy = Number.parseInt(iyRaw ?? "", 10);

  if (!Number.isFinite(ix) || !Number.isFinite(iy)) {
    return null;
  }

  return { ix, iy };
};

export function SprayHeatmap({ bins }: SprayHeatmapProps) {
  if (!bins.length) {
    return <div className="text-xs text-slate-500">Ingen data ännu.</div>;
  }

  const maxCount = Math.max(...bins.map((bin) => bin.count));
  const minX = Math.min(...bins.map((bin) => bin.xCenter_m));
  const maxX = Math.max(...bins.map((bin) => bin.xCenter_m));
  const minY = Math.min(...bins.map((bin) => bin.yCenter_m));
  const maxY = Math.max(...bins.map((bin) => bin.yCenter_m));

  const parsed = bins
    .map((bin) => ({ ...bin, ...parseIndex(bin.key) }))
    .filter((bin): bin is SprayBin & { ix: number; iy: number } => bin.ix != null && bin.iy != null);

  const ixValues = parsed.map((bin) => bin.ix);
  const iyValues = parsed.map((bin) => bin.iy);
  const minIx = ixValues.length ? Math.min(...ixValues) : 0;
  const maxIx = ixValues.length ? Math.max(...ixValues) : 0;
  const minIy = iyValues.length ? Math.min(...iyValues) : 0;
  const maxIy = iyValues.length ? Math.max(...iyValues) : 0;

  const plotWidth = SVG_WIDTH - PADDING * 2;
  const plotHeight = SVG_HEIGHT - PADDING * 2;

  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);

  const columns = Math.max(maxIx - minIx + 1, 1);
  const rows = Math.max(maxIy - minIy + 1, 1);

  const cellWidth = plotWidth / columns;
  const cellHeight = plotHeight / rows;

  const mapX = (x: number) => PADDING + ((x - minX) / xRange) * plotWidth;
  const mapY = (y: number) =>
    SVG_HEIGHT - PADDING - ((y - minY) / yRange) * plotHeight;

  return (
    <svg
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      role="img"
      aria-label="Spray heatmap"
      className="w-full h-auto"
    >
      <rect
        x={PADDING}
        y={PADDING}
        width={plotWidth}
        height={plotHeight}
        fill="#0f172a"
        stroke={axisColor}
        strokeWidth={1}
      />

      <line
        x1={PADDING}
        y1={SVG_HEIGHT - PADDING}
        x2={SVG_WIDTH - PADDING}
        y2={SVG_HEIGHT - PADDING}
        stroke={axisColor}
        strokeWidth={1}
      />
      <line
        x1={PADDING}
        y1={PADDING}
        x2={PADDING}
        y2={SVG_HEIGHT - PADDING}
        stroke={axisColor}
        strokeWidth={1}
      />

      {parsed.map((bin) => {
        const cx = mapX(bin.xCenter_m);
        const cy = mapY(bin.yCenter_m);
        const opacity = maxCount > 0 ? bin.count / maxCount : 0;
        const x = cx - cellWidth / 2;
        const y = cy - cellHeight / 2;

        return (
          <rect
            key={bin.key}
            x={x}
            y={y}
            width={cellWidth * 0.9}
            height={cellHeight * 0.9}
            fill="#22d3ee"
            opacity={opacity}
          />
        );
      })}

      <text
        x={SVG_WIDTH / 2}
        y={SVG_HEIGHT - 4}
        textAnchor="middle"
        fontSize={12}
        fill="#cbd5f5"
      >
        Framåt (m)
      </text>
      <text
        x={16}
        y={SVG_HEIGHT / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${SVG_HEIGHT / 2})`}
        fontSize={12}
        fill="#cbd5f5"
      >
        Vänster / Höger (m)
      </text>
    </svg>
  );
}

export default SprayHeatmap;
