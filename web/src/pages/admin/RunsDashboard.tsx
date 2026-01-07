import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  listRunsV1,
  pruneRunsV1,
  resolveRunsError,
  type RunListItem,
  type RunPruneRequest,
  type RunsListFilters,
} from "@/api/runsV1";
import RunsTable from "@/features/admin/runs/RunsTable";
import RunsFilters from "@/features/admin/runs/RunsFilters";
import {
  buildRunsQuery,
  parseRunsQuery,
  updateRunsUrlState,
  type RunsSortDirection,
  type RunsSortKey,
  type RunsUrlState,
  DEFAULT_RUNS_URL_STATE,
} from "@/features/admin/runs/runsUrlState";
import RunDetailPanel from "./RunDetailPanel";
import { runsPruneEnabled, runsPruneLocked } from "@/config";
import { toast } from "@/ui/toast";

const INVALID_NUMBER_MESSAGE = "Must be a number";
export const SEARCH_DEBOUNCE_MS = 300;

export function buildPrunePayload(
  maxRuns: string,
  maxAgeDays: string,
): {
  payload: RunPruneRequest;
  errors: { maxRuns?: string; maxAgeDays?: string };
} {
  const errors: { maxRuns?: string; maxAgeDays?: string } = {};
  const payload: RunPruneRequest = {};

  const trimmedRuns = maxRuns.trim();
  if (trimmedRuns.length) {
    const parsed = Number(trimmedRuns);
    if (Number.isFinite(parsed)) {
      payload.max_runs = parsed;
    } else {
      errors.maxRuns = INVALID_NUMBER_MESSAGE;
    }
  }

  const trimmedAge = maxAgeDays.trim();
  if (trimmedAge.length) {
    const parsed = Number(trimmedAge);
    if (Number.isFinite(parsed)) {
      payload.max_age_days = parsed;
    } else {
      errors.maxAgeDays = INVALID_NUMBER_MESSAGE;
    }
  }

  return { payload, errors };
}

export default function RunsDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlState = useMemo(() => parseRunsQuery(location.search), [location.search]);
  const urlStateRef = useRef(urlState);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RunsListFilters>({
    limit: urlState.limit ?? DEFAULT_RUNS_URL_STATE.limit,
    status: urlState.status || undefined,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(urlState.q);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const [pruneMaxRuns, setPruneMaxRuns] = useState<string>("");
  const [pruneMaxAgeDays, setPruneMaxAgeDays] = useState<string>("");
  const [pruneConfirm, setPruneConfirm] = useState("");

  const pruneValidation = useMemo(
    () => buildPrunePayload(pruneMaxRuns, pruneMaxAgeDays),
    [pruneMaxRuns, pruneMaxAgeDays],
  );

  useEffect(() => {
    urlStateRef.current = urlState;
  }, [urlState]);

  const getLatestUrlState = () => urlStateRef.current ?? urlState;

  useEffect(() => {
    setFilters((prev) => {
      const nextStatus = urlState.status || undefined;
      const nextLimit = urlState.limit ?? DEFAULT_RUNS_URL_STATE.limit;
      if (prev.status === nextStatus && prev.limit === nextLimit) return prev;
      return { ...prev, status: nextStatus, limit: nextLimit };
    });
  }, [urlState.status, urlState.limit]);

  useEffect(() => {
    setSearchInput((prev) => (prev === urlState.q ? prev : urlState.q));
  }, [urlState.q]);

  useEffect(() => {
    let cancelled = false;
    async function fetchRuns() {
      setLoading(true);
      setError(null);
      try {
        const response = await listRunsV1({
          ...filters,
          q: urlState.q || undefined,
          status: urlState.status || undefined,
          sort: urlState.sort,
          dir: urlState.dir,
          cursor: urlState.cursor ?? undefined,
          limit: urlState.limit,
        });
        if (cancelled) return;
        setRuns(response.items);
        setNextCursor(response.next_cursor ?? null);
        setPrevCursor(response.prev_cursor ?? null);
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
  }, [filters, urlState.cursor, urlState.q, urlState.status, urlState.sort, urlState.dir, urlState.limit]);

  const canGoPrev = useMemo(() => Boolean(prevCursor), [prevCursor]);
  const canGoNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const updateQuery = (
    patch: Partial<RunsUrlState> | ((prev: RunsUrlState) => Partial<RunsUrlState> | RunsUrlState),
    options: { replace?: boolean } = { replace: true },
  ) => {
    const base = getLatestUrlState();
    const updates = typeof patch === "function" ? patch(base) : patch;
    const nextState = updateRunsUrlState(base, updates);
    urlStateRef.current = nextState;
    const nextSearch = buildRunsQuery(nextState);
    navigate({ search: nextSearch }, { replace: options.replace ?? true });
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const latest = getLatestUrlState();
      if (searchInput !== latest.q) {
        updateQuery((prev) => ({ ...prev, q: searchInput, cursor: null }), { replace: true });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const handleFilterChange = (next: RunsListFilters) => {
    setFilters(next);
    updateQuery({
      status: next.status ?? "",
      limit: next.limit ?? DEFAULT_RUNS_URL_STATE.limit,
      cursor: null,
    });
  };

  const handleNext = () => {
    if (!nextCursor) return;
    updateQuery({ cursor: nextCursor }, { replace: false });
  };

  const handlePrev = () => {
    if (!prevCursor) return;
    updateQuery({ cursor: prevCursor }, { replace: false });
  };

  const handleSelectRun = (runId: string) => {
    updateQuery({ runId }, { replace: false });
  };

  const handleCloseDetail = () => {
    updateQuery({ runId: null }, { replace: true });
  };

  const handleSortChange = (sort: RunsSortKey) => {
    updateQuery({ sort, cursor: null });
  };

  const handleDirectionToggle = () => {
    const nextDir: RunsSortDirection = urlState.dir === "asc" ? "desc" : "asc";
    updateQuery({ dir: nextDir, cursor: null });
  };

  const handlePrune = async () => {
    setPruneBusy(true);
    setPruneResult(null);
    if (pruneValidation.errors.maxRuns || pruneValidation.errors.maxAgeDays) {
      setPruneResult(pruneValidation.errors.maxRuns ?? pruneValidation.errors.maxAgeDays ?? null);
      setPruneBusy(false);
      return;
    }
    try {
      const response = await pruneRunsV1(pruneValidation.payload);
      setPruneResult(`Scanned ${response.scanned}; deleted ${response.deleted}; kept ${response.kept}.`);
      toast.success(`Pruned ${response.deleted} runs (kept ${response.kept}).`);
      updateQuery({ cursor: null }, { replace: true });
    } catch (err) {
      const resolved = resolveRunsError(err, "Prune failed");
      setPruneResult(resolved.message);
      toast.error(resolved.message);
    } finally {
      setPruneBusy(false);
    }
  };

  const pruneDisabledReason = useMemo(() => {
    if (pruneValidation.errors.maxRuns || pruneValidation.errors.maxAgeDays) {
      return pruneValidation.errors.maxRuns ?? pruneValidation.errors.maxAgeDays ?? null;
    }
    if (!runsPruneEnabled) return "Pruning disabled for this environment.";
    if (runsPruneLocked) return "Pruning locked in production.";
    if (pruneConfirm.trim() !== "PRUNE") return "Type PRUNE to confirm.";
    return null;
  }, [pruneConfirm, pruneValidation.errors.maxAgeDays, pruneValidation.errors.maxRuns, runsPruneEnabled, runsPruneLocked]);

  const filteredRuns = useMemo(() => {
    if (!onlyErrors) return runs;
    return runs.filter((run) => Boolean(run.error_code));
  }, [runs, onlyErrors]);

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

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="relative w-full max-w-md">
          <input
            type="search"
            placeholder="Search run ID, user, or status…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="runs-search-input"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase text-slate-500">
            Search
          </span>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
          <span className="text-xs text-slate-400">Only errors</span>
          <input
            type="checkbox"
            checked={onlyErrors}
            onChange={(e) => setOnlyErrors(e.target.checked)}
            className="h-4 w-4 accent-emerald-400"
          />
        </label>

        <select
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={urlState.sort}
          onChange={(e) => handleSortChange(e.target.value as RunsSortKey)}
          data-testid="runs-sort-select"
        >
          <option value="created">Created time</option>
          <option value="duration">Duration</option>
          <option value="status">Status</option>
        </select>
        <button
          onClick={handleDirectionToggle}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-200"
          type="button"
          data-testid="runs-sort-direction"
        >
          {urlState.dir === "asc" ? "Asc" : "Desc"}
        </button>
      </div>

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
            disabled={!canGoNext || loading}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>

      <RunsTable runs={filteredRuns} loading={loading} error={error} onSelect={handleSelectRun} />

      {urlState.runId ? <RunDetailPanel runId={urlState.runId} onClose={handleCloseDetail} /> : null}

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
                {pruneValidation.errors.maxRuns && (
                  <p className="text-xs text-red-300">{pruneValidation.errors.maxRuns}</p>
                )}
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
                {pruneValidation.errors.maxAgeDays && (
                  <p className="text-xs text-red-300">{pruneValidation.errors.maxAgeDays}</p>
                )}
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
