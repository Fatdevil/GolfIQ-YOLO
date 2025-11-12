import * as React from 'react';

import { useEventContext } from '@web/events/context';
import { openAndSeekTo } from '@web/player/seek';
import { fetchMany } from '@web/sg/fetchMany';
import {
  fetchAnchors,
  fetchRunSG,
  getCachedAnchors,
  getCachedRunSG,
  setCachedAnchors,
  setCachedRunSG,
  type Anchor,
  type RunSG,
} from '@web/sg/hooks';
import { SGDeltaBadge } from '@web/sg/SGDeltaBadge';
import { isSGFeatureEnabled } from '@web/sg/feature';

const keyFor = (hole: number, shot: number) => `${hole}:${shot}`;

type SimpleShot = {
  key: string;
  hole: number;
  shot: number;
  delta: number;
  anchor: Anchor;
};

type EventShotRow = SimpleShot & {
  runId: string;
  memberId: string;
  name: string;
};

function collectTopShots(
  sg: RunSG | undefined,
  anchors: Map<string, Anchor>,
  canShow?: (clipId: string) => boolean,
): SimpleShot[] {
  if (!sg?.holes?.length) {
    return [];
  }
  const rows: SimpleShot[] = [];
  sg.holes.forEach((holeEntry) => {
    const holeNumber = typeof holeEntry?.hole === 'number' ? holeEntry.hole : Number(holeEntry?.hole ?? NaN);
    if (!Number.isFinite(holeNumber)) {
      return;
    }
    holeEntry.shots?.forEach((shotEntry) => {
      const shotNumber = typeof shotEntry?.shot === 'number' ? shotEntry.shot : Number(shotEntry?.shot ?? NaN);
      if (!Number.isFinite(shotNumber)) {
        return;
      }
      const delta = typeof shotEntry?.sg_delta === 'number' ? shotEntry.sg_delta : Number(shotEntry?.sg_delta ?? NaN);
      if (!Number.isFinite(delta) || delta <= 0) {
        return;
      }
      const anchor = anchors.get(keyFor(holeNumber, shotNumber));
      if (!anchor?.clipId || typeof anchor.tStartMs !== 'number') {
        return;
      }
      if (canShow && !canShow(anchor.clipId)) {
        return;
      }
      rows.push({
        key: `${holeNumber}:${shotNumber}`,
        hole: holeNumber,
        shot: shotNumber,
        delta,
        anchor,
      });
    });
  });
  return rows;
}

export function EventTopSGShots({ limit = 10 }: { limit?: number }): JSX.Element | null {
  const { eventId, members, runs, isClipVisible } = useEventContext();
  const featureEnabled = isSGFeatureEnabled();
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

  const [rows, setRows] = React.useState<EventShotRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!featureEnabled || !eventId || runOrder.length === 0) {
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
        const [sgList, anchorLists] = await Promise.all([
          fetchMany(runOrder, async (runId) => {
            const cached = getCachedRunSG(runId);
            if (cached) {
              return cached;
            }
            const value = await fetchRunSG(runId);
            setCachedRunSG(runId, value);
            return value;
          }),
          fetchMany(runOrder, async (runId) => {
            const cached = getCachedAnchors(runId);
            if (cached) {
              return cached;
            }
            const value = await fetchAnchors(runId);
            setCachedAnchors(runId, value);
            return value;
          }),
        ]);
        if (cancelled) {
          return;
        }
        const combined: EventShotRow[] = [];
        sgList.forEach((sg, index) => {
          const runId = runOrder[index];
          const anchors = anchorLists[index] ?? [];
          const anchorMap = new Map<string, Anchor>();
          anchors.forEach((anchor) => {
            if (!anchor) {
              return;
            }
            const hole = typeof anchor.hole === 'number' ? anchor.hole : Number(anchor.hole ?? NaN);
            const shot = typeof anchor.shot === 'number' ? anchor.shot : Number(anchor.shot ?? NaN);
            if (!Number.isFinite(hole) || !Number.isFinite(shot)) {
              return;
            }
            anchorMap.set(keyFor(hole, shot), anchor);
          });
          const memberId = runMeta.get(runId)?.memberId ?? '';
          const name = memberNameById.get(memberId) ?? memberId ?? runId;
          const shots = collectTopShots(sg, anchorMap, isClipVisible);
          shots.forEach((shot) => {
            combined.push({
              ...shot,
              key: `${runId}:${shot.key}`,
              runId,
              memberId,
              name,
            });
          });
        });
        combined.sort((a, b) => b.delta - a.delta);
        setRows(combined.slice(0, Math.max(0, limit)));
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load strokes-gained clips.';
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
  }, [eventId, featureEnabled, isClipVisible, limit, memberNameById, runMeta, runOrder]);

  if (!featureEnabled || !eventId || runOrder.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Event Top SG Shots"
      className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Top SG shots</h3>
        {loading ? <span className="text-xs text-slate-400">Loading…</span> : null}
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {!error && !loading && rows.length === 0 ? (
        <p className="text-sm text-slate-400">No positive strokes-gained clips yet.</p>
      ) : null}
      {!error && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-4 text-sm text-slate-200">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <SGDeltaBadge delta={row.delta} />
                  <span className="font-semibold text-slate-100">{row.name}</span>
                </div>
                <span className="font-mono text-xs uppercase tracking-wide text-slate-400">H{row.hole} • S{row.shot}</span>
              </div>
              <button
                type="button"
                aria-label={`Watch ${row.name} hole ${row.hole} shot ${row.shot}`}
                className="text-xs font-semibold text-emerald-300 underline decoration-dotted underline-offset-4 hover:text-emerald-200"
                onClick={() =>
                  openAndSeekTo({ clipId: row.anchor.clipId, tStartMs: row.anchor.tStartMs, pushUrl: false })
                }
              >
                Watch
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default EventTopSGShots;
