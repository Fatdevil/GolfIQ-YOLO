import type { RunListItem } from "@/api/runsV1";

type Props = {
  runs: RunListItem[];
  loading: boolean;
  error: string | null;
  onSelect: (runId: string) => void;
};

export function RunsTable({ runs, loading, error, onSelect }: Props) {
  const renderBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={8} className="py-6 text-center text-sm text-slate-400">
            Loading runs…
          </td>
        </tr>
      );
    }
    if (error) {
      return (
        <tr>
          <td colSpan={8} className="py-6 text-center text-sm text-red-300">
            {error}
          </td>
        </tr>
      );
    }
    if (!runs.length) {
      return (
        <tr>
          <td colSpan={8} className="py-6 text-center text-sm text-slate-400">
            No runs match the current filters.
          </td>
        </tr>
      );
    }
    return runs.map((run) => {
      const created = safeDate(run.created_at);
      const started = safeDate(run.started_at);
      const finished = safeDate(run.finished_at);
      const duration =
        started && finished ? formatDuration(finished.getTime() - started.getTime()) : "–";
      return (
        <tr
          key={run.run_id}
          data-testid={`run-row-${run.run_id}`}
          className="border-t border-slate-800/80 hover:bg-slate-900/60"
          onClick={() => onSelect(run.run_id)}
        >
          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-emerald-200">{run.run_id}</td>
          <td className="px-4 py-3 text-sm text-slate-300 capitalize">{run.status}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{run.kind ?? "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{created ? created.toLocaleString() : "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{started ? started.toLocaleString() : "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{finished ? finished.toLocaleString() : "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{duration}</td>
          <td className="px-4 py-3 text-sm text-red-300">{run.error_code ?? "—"}</td>
          <td className="px-4 py-3 text-right text-sm">
            <button
              className="rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(run.run_id);
              }}
            >
              Details
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg">
      <table className="min-w-full divide-y divide-slate-800/80 text-left text-sm">
        <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Run ID</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Kind</th>
            <th className="px-4 py-3 font-semibold">Created</th>
            <th className="px-4 py-3 font-semibold">Started</th>
            <th className="px-4 py-3 font-semibold">Finished</th>
            <th className="px-4 py-3 font-semibold">Duration</th>
            <th className="px-4 py-3 font-semibold">Error code</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-slate-950/40">{renderBody()}</tbody>
      </table>
    </div>
  );
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export default RunsTable;
