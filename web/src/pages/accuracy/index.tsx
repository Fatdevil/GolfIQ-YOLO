import { useCallback, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import {
  AccuracyRow,
  aggregate,
  parseNdjson,
} from "@shared/telemetry/accuracy/aggregate";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

interface TableColumn<T extends Record<string, unknown>> {
  key: keyof T;
  label: string;
  numeric?: boolean;
  render?: (value: unknown, row: T) => ReactNode;
}

type BreakdownRow = Record<string, unknown> & {
  id: string;
  tp: number;
  fp: number;
  fn: number;
  precision?: number;
  recall?: number;
  f1?: number;
};

const GLOBAL_SOURCES = ["__ACCURACY_NDJSON__", "exportAccuracyNdjson"] as const;

type WindowWithExport = typeof window & {
  __ACCURACY_NDJSON__?: string;
  exportAccuracyNdjson?: () => string | Promise<string>;
};

export default function AccuracyDashboardPage() {
  const [rows, setRows] = useState<AccuracyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const aggregates = useMemo(() => aggregate(rows), [rows]);

  const handleText = useCallback((text: string) => {
    try {
      const parsed = parseNdjson(text);
      setRows(parsed);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse";
      setError(message);
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        handleText(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to read file";
        setError(message);
      }
    },
    [handleText],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        await handleFile(file);
      }
    },
    [handleFile],
  );

  const onPasteSubmit = useCallback(() => {
    if (!pasteValue.trim()) return;
    handleText(pasteValue);
  }, [handleText, pasteValue]);

  const loadFromGlobal = useCallback(async () => {
    const globalWindow = window as WindowWithExport;
    if (typeof globalWindow.exportAccuracyNdjson === "function") {
      const result = await globalWindow.exportAccuracyNdjson();
      if (result) {
        handleText(String(result));
        return;
      }
    }

    if (typeof globalWindow.__ACCURACY_NDJSON__ === "string") {
      handleText(globalWindow.__ACCURACY_NDJSON__);
      return;
    }

    setError("No in-app export source detected");
  }, [handleText]);

  const totalsCards = useMemo(
    () => [
      { label: "True positives", value: aggregates.totals.tp.toLocaleString() },
      { label: "False positives", value: aggregates.totals.fp.toLocaleString() },
      { label: "False negatives", value: aggregates.totals.fn.toLocaleString() },
      { label: "Precision", value: formatPercent(aggregates.totals.precision) },
      { label: "Recall", value: formatPercent(aggregates.totals.recall) },
      { label: "F1 score", value: formatPercent(aggregates.totals.f1) },
    ],
    [aggregates],
  );

  const holeRows = useMemo(() => {
    return Object.entries(aggregates.byHole).map(([hole, metrics]) => ({
      id: hole,
      hole: Number(hole) === -1 ? "Unknown" : Number(hole),
      ...metrics,
      f1: metrics.f1 ?? computeF1(metrics.precision, metrics.recall),
    }));
  }, [aggregates.byHole]);

  const clubRows = useMemo(() => {
    return Object.entries(aggregates.byClub).map(([club, metrics]) => ({
      id: club,
      club,
      ...metrics,
      f1: metrics.f1 ?? computeF1(metrics.precision, metrics.recall),
    }));
  }, [aggregates.byClub]);

  const distanceRows = useMemo(() => {
    return Object.entries(aggregates.byDistance).map(([bin, metrics]) => ({
      id: bin,
      distance: bin,
      ...metrics,
      f1: metrics.f1 ?? computeF1(metrics.precision, metrics.recall),
    }));
  }, [aggregates.byDistance]);

  const dateRows = useMemo(() => {
    return Object.entries(aggregates.byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, metrics]) => ({
        date,
        ...metrics,
      }));
  }, [aggregates.byDate]);

  const hasData = rows.length > 0;

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-100">Accuracy dashboard</h1>
        <p className="text-sm text-slate-400">
          Explore TP/FP/FN telemetry exports and monitor precision, recall, and F1 trends.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-5 text-sm transition-colors ${
            isDragging ? "border-emerald-400 bg-emerald-500/10" : "hover:border-slate-600"
          }`}
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Load NDJSON file</h2>
            <p className="text-xs text-slate-400">
              Drag & drop an export or choose a .ndjson/.jsonl file from your device.
            </p>
          </div>
          <input
            type="file"
            accept=".ndjson,.jsonl,.txt,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleFile(file);
            }}
            className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded file:border-0 file:bg-emerald-500/20 file:px-3 file:py-1 file:text-emerald-100"
          />
          <span className="text-xs text-slate-500">
            {rows.length ? `${rows.length.toLocaleString()} rows loaded` : "No data loaded yet"}
          </span>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-100">Paste app export</h2>
            <p className="text-xs text-slate-400">
              Paste NDJSON telemetry, or pull from dev builds exposing {GLOBAL_SOURCES.join(" / ")}.
            </p>
          </div>
          <textarea
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            placeholder='{"ts":...,"tp":...,"fp":...,"fn":...}'
            rows={6}
            className="w-full rounded border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onPasteSubmit}
              className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
            >
              Parse pasted NDJSON
            </button>
            <button
              type="button"
              onClick={() => setPasteValue("")}
              className="rounded border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-600"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void loadFromGlobal()}
              className="rounded border border-emerald-500/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
            >
              Load from app export
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-200">{error}</div>
      )}

      {hasData && (
        <div className="grid gap-4 md:grid-cols-3">
          {totalsCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      )}

      {hasData && (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartCard title="Precision & recall by hole">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={holeRows as any}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hole" stroke="#cbd5f5" />
                <YAxis stroke="#cbd5f5" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b" }} formatter={tooltipPercentFormatter} />
                <Legend />
                <Bar dataKey="precision" name="Precision" fill="#6366f1" />
                <Bar dataKey="recall" name="Recall" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Precision & recall by club">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={clubRows as any}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="club" stroke="#cbd5f5" interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis stroke="#cbd5f5" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b" }} formatter={tooltipPercentFormatter} />
                <Legend />
                <Bar dataKey="precision" name="Precision" fill="#6366f1" />
                <Bar dataKey="recall" name="Recall" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Precision & recall by distance">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distanceRows as any}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="distance" stroke="#cbd5f5" />
                <YAxis stroke="#cbd5f5" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b" }} formatter={tooltipPercentFormatter} />
                <Legend />
                <Bar dataKey="precision" name="Precision" fill="#6366f1" />
                <Bar dataKey="recall" name="Recall" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily TP / FP / FN">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dateRows as any}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#cbd5f5" />
                <YAxis stroke="#cbd5f5" />
                <Tooltip contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b" }} />
                <Legend />
                <Line type="monotone" dataKey="tp" name="TP" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fp" name="FP" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fn" name="FN" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {hasData && (
        <div className="space-y-6">
          <BreakdownTable
            title="Hole breakdown"
            rows={holeRows}
            columns={[
              { key: "hole", label: "Hole" },
              { key: "tp", label: "TP", numeric: true },
              { key: "fp", label: "FP", numeric: true },
              { key: "fn", label: "FN", numeric: true },
              { key: "precision", label: "Precision", numeric: true, render: renderPercent },
              { key: "recall", label: "Recall", numeric: true, render: renderPercent },
              { key: "f1", label: "F1", numeric: true, render: renderPercent },
            ]}
            downloadName="hole_breakdown.csv"
            filterKey="hole"
          />
          <BreakdownTable
            title="Club breakdown"
            rows={clubRows}
            columns={[
              { key: "club", label: "Club" },
              { key: "tp", label: "TP", numeric: true },
              { key: "fp", label: "FP", numeric: true },
              { key: "fn", label: "FN", numeric: true },
              { key: "precision", label: "Precision", numeric: true, render: renderPercent },
              { key: "recall", label: "Recall", numeric: true, render: renderPercent },
              { key: "f1", label: "F1", numeric: true, render: renderPercent },
            ]}
            downloadName="club_breakdown.csv"
            filterKey="club"
          />
          <BreakdownTable
            title="Distance breakdown"
            rows={distanceRows}
            columns={[
              { key: "distance", label: "Distance" },
              { key: "tp", label: "TP", numeric: true },
              { key: "fp", label: "FP", numeric: true },
              { key: "fn", label: "FN", numeric: true },
              { key: "precision", label: "Precision", numeric: true, render: renderPercent },
              { key: "recall", label: "Recall", numeric: true, render: renderPercent },
              { key: "f1", label: "F1", numeric: true, render: renderPercent },
            ]}
            downloadName="distance_breakdown.csv"
            filterKey="distance"
          />
        </div>
      )}

      {!hasData && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          Load accuracy telemetry to unlock KPIs, charts, and breakdown tables.
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
      {children}
    </div>
  );
}

function BreakdownTable<T extends BreakdownRow>({
  title,
  rows,
  columns,
  downloadName,
  filterKey,
}: {
  title: string;
  rows: T[];
  columns: TableColumn<T>[];
  downloadName: string;
  filterKey: keyof T;
}) {
  const [sortKey, setSortKey] = useState<TableColumn<T>["key"] | null>(columns[0]?.key ?? null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => String(row[filterKey] ?? "").toLowerCase().includes(value));
  }, [filterKey, query, rows]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    if (!sortKey) return list;
    return list.sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * direction;
      }
      return String(aValue ?? "").localeCompare(String(bValue ?? "")) * direction;
    });
  }, [filteredRows, sortDirection, sortKey]);

  const onSort = (key: TableColumn<T>["key"]) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const downloadCsv = () => {
    if (!rows.length) return;
    const header = columns.map((column) => column.label);
    const csvRows = rows.map((row) =>
      columns
        .map((column) => JSON.stringify(row[column.key] ?? ""))
        .join(","),
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder={`Filter ${String(filterKey)}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-40 rounded border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-emerald-500 hover:text-emerald-200"
          >
            Download CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  onClick={() => onSort(column.key)}
                  className={`cursor-pointer px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 ${
                    column.numeric ? "text-right" : "text-left"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span>{column.label}</span>
                    {sortKey === column.key && <SortIndicator direction={sortDirection} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/40">
                {columns.map((column) => {
                  const value = row[column.key];
                  const content = column.render ? column.render(value, row) : value;
                  return (
                    <td
                      key={`${row.id}-${String(column.key)}`}
                      className={`px-3 py-2 text-sm ${column.numeric ? "text-right" : "text-left"}`}
                    >
                      {content as ReactNode}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!sortedRows.length && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-slate-500">
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortIndicator({ direction }: { direction: "asc" | "desc" }) {
  return <span className="text-[10px] text-emerald-300">{direction === "asc" ? "▲" : "▼"}</span>;
}

function tooltipPercentFormatter(
  value: ValueType,
  name: NameType,
): [string, NameType] | [ValueType, NameType] {
  if (typeof value === "number") {
    return [`${(value * 100).toFixed(1)}%`, name];
  }
  return [value, name];
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function renderPercent(value: unknown) {
  if (typeof value !== "number") return "–";
  return formatPercent(value);
}

function computeF1(precision?: number, recall?: number) {
  if (precision === undefined || recall === undefined) return 0;
  const denom = precision + recall;
  if (!denom) return 0;
  return (2 * precision * recall) / denom;
}
