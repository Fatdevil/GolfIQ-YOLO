import clsx from 'clsx';
import { useCallback } from 'react';

import type { ShotClip } from './types';
import { preloadImage } from '@web/utils/preload';

type ClipCardProps = {
  clip: ShotClip & { sgDelta?: number | null; score?: number | null };
  onSelect?: (clip: ShotClip) => void;
};

const POSITIVE_THRESHOLD = 0.05;

function formatSgDelta(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value * 100) / 100;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(2)} SG`;
}

function resolveBadgeClass(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'bg-slate-700 text-slate-200';
  }
  if (value > POSITIVE_THRESHOLD) {
    return 'bg-emerald-600 text-emerald-50';
  }
  if (value < -POSITIVE_THRESHOLD) {
    return 'bg-rose-600 text-rose-50';
  }
  return 'bg-slate-700 text-slate-200';
}

export function ClipCard({ clip, onSelect }: ClipCardProps): JSX.Element {
  const player = clip.playerName ?? clip.player_name ?? 'Unknown player';
  const thumbnail = clip.thumbUrl ?? clip.thumbnailUrl ?? clip.thumbnail_url ?? null;
  const sgDelta = clip.sgDelta ?? clip.sg_delta ?? null;
  const sgLabel = formatSgDelta(sgDelta);
  const score = typeof clip.score === 'number' ? clip.score : null;

  const handlePreload = useCallback(() => {
    preloadImage(thumbnail);
  }, [thumbnail]);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(clip)}
      onMouseEnter={handlePreload}
      onFocus={handlePreload}
      className="flex w-full items-stretch gap-4 rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-slate-700 hover:bg-slate-800"
    >
      <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded bg-slate-800">
        {thumbnail ? (
          <img src={thumbnail} alt={player} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm text-slate-400">No preview</span>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">{player}</p>
            {clip.aiTitle ?? clip.ai_title ? (
              <p className="text-xs text-slate-300">{clip.aiTitle ?? clip.ai_title ?? ''}</p>
            ) : null}
          </div>
          {sgLabel ? (
            <span className={clsx('rounded-full px-2 py-1 text-xs font-semibold', resolveBadgeClass(sgDelta))}>{sgLabel}</span>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{new Date(clip.createdAt ?? clip.created_at ?? Date.now()).toLocaleString()}</span>
          {typeof score === 'number' && Number.isFinite(score) ? (
            <span className="font-semibold text-amber-300">Score {score.toFixed(2)}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export { formatSgDelta };
