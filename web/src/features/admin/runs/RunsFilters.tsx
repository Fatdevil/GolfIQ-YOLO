import { useMemo } from "react";
import type { RunsListFilters, RunStatusV1 } from "@/api/runsV1";

type Props = {
  filters: RunsListFilters;
  onChange: (next: RunsListFilters) => void;
  disabled?: boolean;
};

const STATUS_OPTIONS: Array<{ label: string; value: RunStatusV1 | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Running", value: "processing" },
  { label: "Succeeded", value: "succeeded" },
  { label: "Failed", value: "failed" },
];

const KIND_OPTIONS = [
  { label: "Any kind", value: "" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Range", value: "range" },
];

const LIMIT_OPTIONS = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];

export function RunsFilters({ filters, onChange, disabled }: Props) {
  const createdAfterValue = useMemo(() => {
    return filters.createdAfter ? formatLocalDate(filters.createdAfter) : "";
  }, [filters.createdAfter]);
  const createdBeforeValue = useMemo(() => {
    return filters.createdBefore ? formatLocalDate(filters.createdBefore) : "";
  }, [filters.createdBefore]);

  const update = (patch: Partial<RunsListFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <select
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        value={filters.status ?? ""}
        onChange={(e) => update({ status: e.target.value as RunStatusV1 | "" })}
        disabled={disabled}
        data-testid="runs-status-filter"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        value={filters.kind ?? ""}
        onChange={(e) => update({ kind: e.target.value })}
        disabled={disabled}
      >
        {KIND_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Model variant"
        className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        value={filters.modelVariant ?? ""}
        onChange={(e) => update({ modelVariant: e.target.value || undefined })}
        disabled={disabled}
      />

      <label className="flex items-center gap-2 text-xs text-slate-400">
        Created after
        <input
          type="datetime-local"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={createdAfterValue}
          onChange={(e) => update({ createdAfter: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          disabled={disabled}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        Created before
        <input
          type="datetime-local"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={createdBeforeValue}
          onChange={(e) =>
            update({ createdBefore: e.target.value ? new Date(e.target.value).toISOString() : undefined })
          }
          disabled={disabled}
        />
      </label>

      <select
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        value={filters.limit ?? 25}
        onChange={(e) => update({ limit: Number(e.target.value) })}
        disabled={disabled}
      >
        {LIMIT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} per page
          </option>
        ))}
      </select>
    </div>
  );
}

function formatLocalDate(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default RunsFilters;
