import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MetricSample = {
  timeSec: number;
  value: number | null;
};

export type RecenterInterval = {
  startSec: number;
  endSec: number;
};

interface MetricChartProps {
  title: string;
  color: string;
  data: MetricSample[];
  unit?: string;
  yDomain?: [number | "auto", number | "auto"];
  recenterIntervals?: RecenterInterval[];
  additionalLine?: {
    dataKey: string;
    stroke: string;
    name: string;
    data: Array<{ timeSec: number; [key: string]: number | null }>;
  };
}

const tooltipFormatter = (value: number | string | Array<number | string>, unit?: string) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "number") {
    return [`${value.toFixed(2)}${unit ? ` ${unit}` : ""}`, ""];
  }
  return [value, ""];
};

export function MetricChart({
  title,
  color,
  data,
  unit,
  yDomain,
  recenterIntervals = [],
  additionalLine,
}: MetricChartProps) {
  const baseData = data.map((sample) => ({ timeSec: sample.timeSec, value: sample.value }));

  const mergedData = (() => {
    if (!additionalLine) {
      return baseData;
    }
    const lookup = new Map<string, Record<string, number | null>>();
    additionalLine.data.forEach((entry) => {
      lookup.set(entry.timeSec.toFixed(4), entry);
    });
    return baseData.map((sample) => {
      const match = lookup.get(sample.timeSec.toFixed(4));
      return match ? { ...sample, ...match } : sample;
    });
  })();

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="timeSec"
              stroke="#94a3b8"
              tickFormatter={(value) => `${value.toFixed(1)}s`}
              domain={[0, "auto"]}
              type="number"
            />
            <YAxis
              stroke="#94a3b8"
              domain={yDomain ?? ["auto", "auto"]}
              tickFormatter={(value) => `${value}${unit ? ` ${unit}` : ""}`}
            />
            <Tooltip
              formatter={(value: number | string | Array<number | string>) =>
                tooltipFormatter(value, unit)
              }
              labelFormatter={(value) => `${Number(value).toFixed(2)}s`}
            />
            <Legend />
            {recenterIntervals.map((interval, index) => {
              if (interval.endSec > interval.startSec) {
                return (
                  <ReferenceArea
                    key={`recenter-area-${index}`}
                    x1={interval.startSec}
                    x2={interval.endSec}
                    fill="#a855f7"
                    fillOpacity={0.1}
                    stroke="#c084fc"
                    strokeOpacity={0.4}
                  />
                );
              }
              return (
                <ReferenceLine
                  key={`recenter-line-${index}`}
                  x={interval.startSec}
                  stroke="#c084fc"
                  strokeDasharray="4 4"
                />
              );
            })}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              name={unit ? `${title} (${unit})` : title}
              isAnimationActive={false}
              connectNulls
            />
            {additionalLine && (
              <Line
                type="monotone"
                dataKey={additionalLine.dataKey}
                stroke={additionalLine.stroke}
                strokeWidth={1.5}
                dot={false}
                name={additionalLine.name}
                isAnimationActive={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
