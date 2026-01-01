import { useEffect, useMemo, useState } from "react";
import { listRunsV1, pruneRunsV1, resolveRunsError, type RunListItem, type RunsListFilters } from "@/api/runsV1";
import RunsTable from "@/features/admin/runs/RunsTable";
import RunsFilters from "@/features/admin/runs/RunsFilters";
import RunDetailPanel from "@/features/admin/runs/RunDetailPanel";
import { runsPruneEnabled, runsPruneLocked } from "@/config";
import { toast } from "@/ui/toast";

type RunsDashboardPageProps = {
  initialCursor?: string | null;
  debugControls?: (controls: { setCursor: (cursor: string | null) => void }) => void;
};

const DEFAULT_LIMIT = 25;

export default function RunsDashboardPage({ initialCursor = null, debugControls }: RunsDashboardPageProps) {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RunsListFilters>({ limit: DEFAULT_LIMIT });
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor ?? null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const [pruneMaxRuns, setPruneMaxRuns] = useState<string>("");
  const [pruneMaxAgeDays, setPruneMaxAgeDays] = useState<string>("");
  const [pruneConfirm, setPruneConfirm] = useState("");

  useEffect(() => {
    if (debugControls) {
      debugControls({ setCursor: setCurrentCursor });
    }
  }, [debugControls]);

  useEffect(() => {
    let cancelled = false;
    async function fetchRuns() {
      setLoading(true);
      setError(null);
      try {
        const response = await listRunsV1({
          ...filters,
          cursor: currentCursor ?? undefined,
        });
        if (cancelled) return;
        setRuns(response.items);
        setNextCursor(response.next_cursor ?? null);
      } catch (err) {
        if (cancelled) return;
        const resolved = resolveRunsError(err, "Failed to load runs");
        setError(resolved.message);
        toast.error(resolved.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRuns();
    return () => {
      cancelled = true;
    };
  }, [filters, currentCursor]);

  const canGoPrev = useMemo(() => cursorStack.length > 0, [cursorStack.length]);
  const canGoNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const handleFilterChange = (next: RunsListFilters) => {
    setCursorStack([]);
    setCurrentCursor(initialCursor);
    setFilters(next);
  };

  const handleNext = () => {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, currentCursor ?? ""]);
    setCurrentCursor(nextCursor);
  };

  const handlePrev = () => {
    setCursorStack((stack) => {
      if (!stack.length) return stack;
      const updated = [...stack];
      const prev = updated.pop() ?? null;
      setCurrentCursor(prev && prev.length ? prev : null);
      return updated;
    });
  };

  const handlePrune = async () => {
    setPruneBusy(true);
    setPruneResult(null);
    try {
      const payload = {
        max_runs: pruneMaxRuns ? Number(pruneMaxRuns) : undefined,
        max_age_days: pruneMaxAgeDays ? Number(pruneMaxAgeDays) : undefined,
      };
      const response = await pruneRunsV1(payload);
      setPruneResult(`Scanned ${response.scanned}; deleted ${response.deleted}; kept ${response.kept}.`);
      toast.error(`Pruned ${response.deleted} runs (kept ${response.kept}).`);
      setCursorStack([]);
      setCurrentCursor(null);
    } catch (err) {
      const resolved = resolveRunsError(err, "Prune failed");
      setPruneResult(resolved.message);
      toast.error(resolved.message);
    } finally {
      setPruneBusy(false);
    }
  };

  const pruneDisabledReason = useMemo(() => {
    if (!runsPruneEnabled) return "Pruning disabled for this environment.";
    if (runsPruneLocked) return "Pruning locked in production.";
    if (pruneConfirm.trim() !== "PRUNE") return "Type PRUNE to confirm.";
    return null;
  }, [pruneConfirm, runsPruneEnabled, runsPruneLocked]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Runs dashboard</h1>
          <p className="text-sm text-slate-400">
            Browse and inspect runs via the Runs API v1. Filters, pagination, and detail diagnostics are available.
          </p>
        </div>
        {runsPruneEnabled && (
          <button
            onClick={() => setPruneModalOpen(true)}
            className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/20"
          >
            Prune…
          </button>
        )}
      </header>

      <RunsFilters filters={filters} onChange={handleFilterChange} disabled={loading} />

      <div
        className="flex items-center justify-between text-sm text-slate-400"
        data-testid="runs-pagination"
      >
        <div>Showing {runs.length} runs</div>
        <div className="flex gap-2">
          <button
            onClick={handlePrev}
            disabled={!canGoPrev || loading}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Prev
          </button>
          <button
            data-testid="runs-next-page"
            onClick={handleNext}
            disabled={loading}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

      <RunsTable runs={runs} loading={loading} error={error} onSelect={setSelectedRunId} />

      {selectedRunId ? <RunDetailPanel runId={selectedRunId} onClose={() => setSelectedRunId(null)} /> : null}

      {pruneModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur">
          <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-red-100">Prune runs</h2>
                <p className="text-xs text-slate-400">
                  Deletes terminal runs according to the retention rules. Confirm by typing PRUNE.
                </p>
              </div>
              <button
                onClick={() => setPruneModalOpen(false)}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Max runs to keep (optional)</span>
                <input
                  type="number"
                  min={0}
                  value={pruneMaxRuns}
                  onChange={(e) => setPruneMaxRuns(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Max age (days, optional)</span>
                <input
                  type="number"
                  min={0}
                  value={pruneMaxAgeDays}
                  onChange={(e) => setPruneMaxAgeDays(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-400">
                  Confirmation (type <code className="text-emerald-300">PRUNE</code>)
                </span>
                <input
                  type="text"
                  value={pruneConfirm}
                  onChange={(e) => setPruneConfirm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>

              {runsPruneLocked && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Pruning is locked in this environment. Adjust the environment variable to unlock in non-production
                  contexts.
                </div>
              )}

              {pruneResult && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-200">
                  {pruneResult}
                </div>
              )}

              <button
                onClick={handlePrune}
                disabled={Boolean(pruneDisabledReason) || pruneBusy}
                className="w-full rounded-md border border-red-500/50 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 transition hover:border-red-400 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pruneBusy ? "Pruning…" : "Confirm prune"}
              </button>
              {pruneDisabledReason && <div className="text-center text-xs text-slate-400">{pruneDisabledReason}</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
