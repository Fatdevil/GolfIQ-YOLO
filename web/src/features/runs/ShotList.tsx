import { useMemo } from 'react';

import { openAndSeekTo } from '@web/player/seek';
import SGDeltaBadge from '@web/sg/SGDeltaBadge';
import { CaddieTipPanel } from '@web/sg/CaddieTipPanel';
import { useAnchors, useRunSG } from '@web/sg/hooks';
import { isSGFeatureEnabled } from '@web/sg/feature';
import { isClipVisible } from '@web/sg/visibility';

export type ShotModerationState = {
  hole: number;
  shot: number;
  clipId?: string | null;
  hidden?: boolean;
  visibility?: 'private' | 'event' | 'friends' | 'public' | string | null;
  before_m?: number;
  bearing_deg?: number;
};

const keyFor = (hole: number, shot: number) => `${hole}:${shot}`;

type ShotListProps = {
  runId?: string | null;
  shots?: ShotModerationState[];
  onOpenClip?: (clipId: string, tMs: number) => void;
};

type RenderEntry = {
  hole: number;
  shot: number;
  delta: number;
  hasDelta: boolean;
  clipId?: string;
  tStartMs?: number;
  visible: boolean;
  before_m?: number;
  bearing_deg?: number;
};

export function ShotList({ runId, shots = [], onOpenClip }: ShotListProps) {
  if (!isSGFeatureEnabled()) {
    return null;
  }

  const normalizedRunId = typeof runId === 'string' ? runId : '';
  const { data: sg, loading: sgLoading, error: sgError } = useRunSG(normalizedRunId);
  const { data: anchors, loading: anchorLoading, error: anchorError } = useAnchors(normalizedRunId);

  const moderationByShot = useMemo(() => {
    const map = new Map<string, ShotModerationState>();
    shots.forEach((entry) => {
      if (!entry) return;
      const { hole, shot } = entry;
      if (typeof hole !== 'number' || typeof shot !== 'number') {
        return;
      }
      const key = keyFor(hole, shot);
      const existing = map.get(key);
      if (existing) {
        const next: ShotModerationState = { ...existing };
        if (entry.clipId !== undefined) {
          next.clipId = entry.clipId;
        }
        if (entry.hidden !== undefined) {
          next.hidden = entry.hidden;
        }
        if (entry.visibility !== undefined) {
          next.visibility = entry.visibility;
        }
        if (entry.before_m !== undefined) {
          next.before_m = entry.before_m;
        }
        if (entry.bearing_deg !== undefined) {
          next.bearing_deg = entry.bearing_deg;
        }
        map.set(key, next);
      } else {
        map.set(key, entry);
      }
    });
    return map;
  }, [shots]);

  const clipStateByClipId = useMemo(() => {
    const map = new Map<string, ShotModerationState>();
    shots.forEach((entry) => {
      if (!entry?.clipId) return;
      map.set(entry.clipId, entry);
    });
    return map;
  }, [shots]);

  const anchorByKey = useMemo(() => {
    const map = new Map<string, { clipId: string; tStartMs: number }>();
    anchors?.forEach((anchor) => {
      const { hole, shot, clipId, tStartMs } = anchor;
      if (!clipId) return;
      map.set(keyFor(hole, shot), { clipId, tStartMs });
    });
    return map;
  }, [anchors]);

  const entries = useMemo<RenderEntry[]>(() => {
    if (!sg?.holes?.length) {
      return [];
    }
    const list: RenderEntry[] = [];
    sg.holes.forEach((holeEntry) => {
      holeEntry.shots.forEach((shotEntry) => {
        const key = keyFor(shotEntry.hole, shotEntry.shot);
        const anchor = anchorByKey.get(key);
        const moderation = moderationByShot.get(key) ?? (anchor?.clipId ? clipStateByClipId.get(anchor.clipId) : undefined);
        const visible = isClipVisible(moderation);
        const delta = shotEntry.sg_delta;
        const hasDelta = Number.isFinite(delta);
        list.push({
          hole: shotEntry.hole,
          shot: shotEntry.shot,
          delta,
          hasDelta,
          clipId: anchor?.clipId,
          tStartMs: anchor?.tStartMs,
          visible,
          before_m: moderation?.before_m,
          bearing_deg: moderation?.bearing_deg,
        });
      });
    });
    return list.sort((a, b) => (a.hole === b.hole ? a.shot - b.shot : a.hole - b.hole));
  }, [sg, anchorByKey, moderationByShot, clipStateByClipId]);

  if (!normalizedRunId) {
    return null;
  }

  if (sgError) {
    return (
      <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        Failed to load strokes gained: {sgError.message}
      </div>
    );
  }

  if (anchorError) {
    return (
      <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        Failed to load anchors: {anchorError.message}
      </div>
    );
  }

  if (sgLoading || anchorLoading) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
        Loading strokes gained…
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
        No strokes-gained data available for this run yet.
      </div>
    );
  }

  const handleWatch = (clipId: string, tStartMs: number | undefined) => {
    if (!clipId || typeof tStartMs !== 'number') return;
    if (onOpenClip) {
      onOpenClip(clipId, tStartMs);
      return;
    }
    openAndSeekTo({ clipId, tStartMs, pushUrl: false });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-lg">
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-100">Strokes-gained by shot</h3>
        {Number.isFinite(sg?.total_sg ?? NaN) ? (
          <p className="mt-1 text-sm text-slate-300">
            Total SG: <SGDeltaBadge delta={sg!.total_sg} />
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
          <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Hole</th>
              <th className="px-4 py-2 text-left font-semibold">Shot</th>
              <th className="px-4 py-2 text-left font-semibold">SGΔ</th>
              <th className="px-4 py-2 text-left font-semibold">Action</th>
              <th className="px-4 py-2 text-left font-semibold">Advice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {entries.map((entry) => {
              const key = keyFor(entry.hole, entry.shot);
              const canWatch = entry.visible && entry.clipId && typeof entry.tStartMs === 'number';
              return (
                <tr key={key} className="odd:bg-slate-900/40">
                  <td className="px-4 py-2 font-mono text-xs text-emerald-200">{entry.hole}</td>
                  <td className="px-4 py-2 font-mono text-xs text-emerald-200">{entry.shot}</td>
                  <td className="px-4 py-2">
                    {entry.visible && entry.hasDelta ? (
                      canWatch ? (
                        <button
                          type="button"
                          onClick={() => handleWatch(entry.clipId!, entry.tStartMs)}
                          className="rounded px-2 py-1 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                          aria-label={`Watch clip for hole ${entry.hole} shot ${entry.shot}`}
                        >
                          <SGDeltaBadge delta={entry.delta} />
                        </button>
                      ) : (
                        <SGDeltaBadge delta={entry.delta} />
                      )
                    ) : (
                      <span className="text-xs text-slate-500">{entry.visible ? '—' : 'Hidden'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {canWatch ? (
                      <button
                        type="button"
                        onClick={() => handleWatch(entry.clipId!, entry.tStartMs)}
                        className="rounded border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
                      >
                        Watch
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">{entry.visible ? 'No clip' : 'Restricted'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    {normalizedRunId ? (
                      <CaddieTipPanel
                        runId={normalizedRunId}
                        hole={entry.hole}
                        shot={entry.shot}
                        before_m={Math.max(0, Number.isFinite(entry.before_m) ? (entry.before_m as number) : 0)}
                        bearing_deg={Number.isFinite(entry.bearing_deg) ? (entry.bearing_deg as number) : 0}
                      />
                    ) : (
                      <span className="text-xs text-slate-500">No run id</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ShotList;
