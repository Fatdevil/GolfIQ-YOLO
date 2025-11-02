import React, { useMemo } from 'react';

type ClubSparklineProps = {
  carries: number[];
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  width?: number;
  height?: number;
};

function normalize(values: number[], range: { min: number; max: number }): number[] {
  const { min, max } = range;
  if (max <= min) {
    return values.map(() => 0);
  }
  return values.map((value) => (value - min) / (max - min));
}

export default function ClubSparkline({
  carries,
  p25,
  p50,
  p75,
  width = 160,
  height = 48,
}: ClubSparklineProps): JSX.Element {
  const points = useMemo(() => {
    if (!carries.length) {
      return '';
    }
    const sorted = [...carries].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const scaled = normalize(sorted, { min, max });
    return scaled
      .map((value, index) => {
        const x = (index / Math.max(1, scaled.length - 1)) * width;
        const y = height - value * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [carries, height, width]);

  const quartileLines = useMemo(() => {
    const quartiles: Array<{ value?: number | null; key: string }> = [
      { key: 'p25', value: p25 },
      { key: 'p50', value: p50 },
      { key: 'p75', value: p75 },
    ];
    if (!carries.length) {
      return null;
    }
    const sorted = [...carries].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return quartiles
      .filter((entry) => typeof entry.value === 'number' && Number.isFinite(entry.value))
      .map((entry) => {
        const ratio = normalize([entry.value as number], { min, max })[0];
        const y = height - ratio * height;
        return (
          <line
            key={entry.key}
            data-marker={entry.key}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            stroke={entry.key === 'p50' ? '#2563eb' : '#6b7280'}
            strokeDasharray={entry.key === 'p50' ? undefined : '4 4'}
            strokeWidth={entry.key === 'p50' ? 2 : 1}
          />
        );
      });
  }, [carries, height, p25, p50, p75, width]);

  return (
    <svg
      role="img"
      aria-label="club-carry-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth={2}
        points={points}
        data-series="carry"
      />
      {quartileLines}
    </svg>
  );
}
