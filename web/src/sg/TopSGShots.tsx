import * as React from 'react';

import { useEventContext } from '@web/events/context';
import { openAndSeekTo } from '@web/player/seek';
import { useAnchors, useRunSG, type Anchor, type RunSG } from '@web/sg/hooks';
import { SGDeltaBadge } from '@web/sg/SGDeltaBadge';

const keyFor = (hole: number, shot: number) => `${hole}:${shot}`;

type TopSGShotsProps = {
  runId: string;
  limit?: number;
  isClipVisible?: (clipId: string) => boolean;
  title?: string;
};

type ShotRow = {
  key: string;
  hole: number;
  shot: number;
  delta: number;
  anchor: Anchor;
};

function positiveDeltaShots(sg: RunSG | undefined, anchors: Map<string, Anchor>, limit: number, canShow?: (clipId: string) => boolean): ShotRow[] {
  if (!sg?.holes?.length) {
    return [];
  }
  const rows: ShotRow[] = [];
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
        key: keyFor(holeNumber, shotNumber),
        hole: holeNumber,
        shot: shotNumber,
        delta,
        anchor,
      });
    });
  });
  return rows.sort((a, b) => b.delta - a.delta).slice(0, Math.max(0, limit));
}

export function TopSGShots({ runId, limit = 5, isClipVisible, title = 'Top SG shots' }: TopSGShotsProps) {
  const normalizedRunId = typeof runId === 'string' && runId.trim() ? runId.trim() : '';
  const { data: sg, loading: sgLoading, error: sgError } = useRunSG(normalizedRunId);
  const { data: anchors, loading: anchorLoading, error: anchorError } = useAnchors(normalizedRunId);
  const eventContext = useEventContext();
  const visibilityGuard = isClipVisible ?? eventContext.isClipVisible;

  const anchorMap = React.useMemo(() => {
    const map = new Map<string, Anchor>();
    anchors?.forEach((anchor) => {
      if (!anchor) return;
      const hole = typeof anchor.hole === 'number' ? anchor.hole : Number(anchor.hole ?? NaN);
      const shot = typeof anchor.shot === 'number' ? anchor.shot : Number(anchor.shot ?? NaN);
      if (!Number.isFinite(hole) || !Number.isFinite(shot)) {
        return;
      }
      map.set(keyFor(hole, shot), anchor);
    });
    return map;
  }, [anchors]);

  const topShots = React.useMemo(
    () => positiveDeltaShots(sg, anchorMap, limit, visibilityGuard),
    [sg, anchorMap, limit, visibilityGuard],
  );

  const handleWatch = React.useCallback(
    (anchor: Anchor) => {
      if (!anchor?.clipId || typeof anchor.tStartMs !== 'number') {
        return;
      }
      openAndSeekTo({ clipId: anchor.clipId, tStartMs: anchor.tStartMs, pushUrl: false });
    },
    [],
  );

  if (!normalizedRunId) {
    return null;
  }

  const isLoading = sgLoading || anchorLoading;
  const error = sgError ?? anchorError;

  return (
    <div aria-label="Top SG Shots" className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {isLoading ? <span className="text-xs text-slate-400">Loading…</span> : null}
      </div>
      {error ? (
        <p className="text-sm text-rose-300">Failed to load strokes-gained clips.</p>
      ) : null}
      {!error && !isLoading && topShots.length === 0 ? (
        <p className="text-sm text-slate-400">No positive strokes-gained shots yet.</p>
      ) : null}
      {!error && topShots.length > 0 ? (
        <ul className="space-y-2">
          {topShots.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-4 text-sm text-slate-200">
              <div className="flex items-center gap-3">
                <SGDeltaBadge delta={row.delta} />
                <span className="font-mono text-xs uppercase tracking-wide text-slate-400">H{row.hole} • S{row.shot}</span>
              </div>
              <button
                type="button"
                aria-label={`Watch hole ${row.hole} shot ${row.shot}`}
                className="text-xs font-semibold text-emerald-300 underline decoration-dotted underline-offset-4 hover:text-emerald-200"
                onClick={() => handleWatch(row.anchor)}
              >
                Watch
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default TopSGShots;
