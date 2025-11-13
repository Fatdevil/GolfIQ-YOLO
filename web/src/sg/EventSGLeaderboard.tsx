import * as React from 'react';

import { useEventContext } from '@web/events/context';
import { fetchMany } from '@web/sg/fetchMany';
import {
  fetchRunSG,
  getCachedRunSG,
  setCachedRunSG,
  type RunSG,
} from '@web/sg/hooks';
import { isSGFeatureEnabled } from '@web/sg/feature';

type LeaderboardRow = {
  runId: string;
  memberId: string;
  name: string;
  total: number;
  thru: number;
};

function computeThru(sg: RunSG | undefined): number {
  if (!sg?.holes?.length) {
    return 0;
  }
  return sg.holes.reduce((max, hole) => {
    const holeNumber = typeof hole?.hole === 'number' ? hole.hole : Number(hole?.hole ?? NaN);
    if (!Number.isFinite(holeNumber)) {
      return max;
    }
    return Math.max(max, holeNumber);
  }, 0);
}

function formatTotal(total: number): string {
  const rounded = Math.round(total * 100) / 100;
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)}`;
}

export function EventSGLeaderboard(): JSX.Element | null {
  const featureEnabled = isSGFeatureEnabled();
  if (!featureEnabled) {
    return null;
  }

  const { eventId, members, runs } = useEventContext();
  const memberNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      if (!member?.id) {
        return;
      }
      const safeName = typeof member.name === 'string' && member.name.trim() ? member.name : member.id;
      map.set(member.id, safeName);
    });
    return map;
  }, [members]);

  const runOrder = React.useMemo(() => {
    const seen = new Set<string>();
    return runs
      .map((run) => (typeof run.runId === 'string' ? run.runId : ''))
      .filter((runId) => {
        if (!runId) {
          return false;
        }
        if (seen.has(runId)) {
          return false;
        }
        seen.add(runId);
        return true;
      });
  }, [runs]);

  const runMeta = React.useMemo(() => {
    const map = new Map<string, { memberId: string }>();
    runs.forEach((run) => {
      if (!run?.runId) {
        return;
      }
      const memberId = typeof run.memberId === 'string' ? run.memberId : '';
      map.set(run.runId, { memberId });
    });
    return map;
  }, [runs]);

  const [rows, setRows] = React.useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!eventId || runOrder.length === 0) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const sgList = await fetchMany(runOrder, async (runId) => {
          const cached = getCachedRunSG(runId);
          if (cached) {
            return cached;
          }
          const value = await fetchRunSG(runId);
          setCachedRunSG(runId, value);
          return value;
        });
        if (cancelled) {
          return;
        }
        const nextRows: LeaderboardRow[] = [];
        sgList.forEach((sg, index) => {
          const runId = runOrder[index];
          const meta = runMeta.get(runId);
          if (!runId || !meta) {
            return;
          }
          const memberId = meta.memberId;
          const totalRaw = sg?.sg_total;
          const total = Number.isFinite(totalRaw ?? NaN) ? Number(totalRaw) : 0;
          const thru = computeThru(sg);
          const name = memberNameById.get(memberId) ?? memberId ?? runId;
          nextRows.push({ runId, memberId, total, thru, name });
        });
        nextRows.sort((a, b) => {
          if (b.total === a.total) {
            return b.thru - a.thru;
          }
          return b.total - a.total;
        });
        setRows(nextRows);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load strokes-gained leaderboard.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, memberNameById, runMeta, runOrder]);

  if (!eventId || runOrder.length === 0) {
    return null;
  }

  return (
    <section aria-label="SG Leaderboard" className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Strokes-Gained Leaderboard</h3>
        {loading ? <span className="text-xs text-slate-400">Loading…</span> : null}
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {!error && !loading && rows.length === 0 ? (
        <p className="text-sm text-slate-400">No strokes-gained data yet.</p>
      ) : null}
      {!error && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Pos</th>
                <th className="px-3 py-2 text-left font-semibold">Player</th>
                <th className="px-3 py-2 text-right font-semibold">Total SG</th>
                <th className="px-3 py-2 text-right font-semibold">Thru</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row, index) => {
                const totalClass = row.total >= 0 ? 'text-emerald-600' : 'text-rose-600';
                return (
                  <tr key={row.runId} className="odd:bg-slate-900/40">
                    <td className="px-3 py-2 text-sm text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-100">{row.name}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${totalClass}`}>{formatTotal(row.total)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{row.thru || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default EventSGLeaderboard;
