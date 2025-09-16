interface MetricCardProps {
  title: string;
  value?: number | string | null;
  unit?: string;
  secondary?: string;
}

function formatValue(value?: number | string | null) {
  if (value === undefined || value === null || value === "") {
    return "–";
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(2);
  }
  return value;
}

export default function MetricCard({ title, value, unit, secondary }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-emerald-300">
          {formatValue(value)}
        </span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {secondary && <p className="mt-1 text-xs text-slate-500">{secondary}</p>}
    </div>
  );
}
