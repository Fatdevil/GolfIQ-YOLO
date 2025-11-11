import { useEffect } from 'react';

import { postTelemetryEvent } from '@web/api';

export type LiveBadgeProps = {
  eventId: string | null | undefined;
  running: boolean;
  viewers?: number | null;
  startedAt?: string | null;
  className?: string;
};

export function LiveBadge({
  eventId,
  running,
  viewers = 0,
  startedAt = null,
  className,
}: LiveBadgeProps): JSX.Element | null {
  const normalizedViewers = Number.isFinite(viewers) && viewers != null ? Math.max(0, Math.trunc(viewers)) : 0;

  useEffect(() => {
    if (!running || !eventId) {
      return;
    }
    void postTelemetryEvent({
      event: 'live.badge.render',
      eventId,
      viewers: normalizedViewers,
      startedAt,
    }).catch((error) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[live/badge] telemetry failed', error);
      }
    });
  }, [eventId, normalizedViewers, running, startedAt]);

  if (!running) {
    return null;
  }

  const viewerLabel = normalizedViewers === 1 ? '1 viewer' : `${normalizedViewers.toLocaleString()} viewers`;

  const defaultClass =
    'inline-flex items-center gap-2 rounded-full border border-rose-500/60 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-rose-200';

  return (
    <span className={className ?? defaultClass}>
      <span aria-hidden="true" className="text-base leading-none text-rose-400">
        ●
      </span>
      <span className="sr-only">Live now:</span>
      <span>LIVE</span>
      <span aria-hidden="true" className="text-rose-300/80">
        ·
      </span>
      <span>{viewerLabel}</span>
    </span>
  );
}
