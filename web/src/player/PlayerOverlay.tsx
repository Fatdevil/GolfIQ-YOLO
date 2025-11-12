import * as React from 'react';

import { getApiKey } from '@web/api';
import { ClipPlayer } from '@web/features/clips/Player';
import { useSignedVideoSource } from '@web/media/useSignedVideoSource';

import type { PlayerOpenDetail } from './seek';

type ClipResponse = {
  id?: string;
  clipId?: string;
  videoUrl?: string | null;
  video_url?: string | null;
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
  anchors?: number[] | null;
};

type OverlayState = PlayerOpenDetail | null;

function authHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  return apiKey ? { 'x-api-key': apiKey } : {};
}

async function fetchClip(clipId: string): Promise<ClipResponse> {
  const response = await fetch(`/api/clips/${clipId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`fetchClip failed: ${response.status}`);
  }
  return response.json();
}

function resolveVideoUrl(record: ClipResponse | null): string | null {
  if (!record) return null;
  const value = record.videoUrl ?? record.video_url ?? null;
  return typeof value === 'string' && value.trim() ? value : null;
}

function resolveAnchors(record: ClipResponse | null): number[] | null {
  if (!record || !Array.isArray(record.anchors)) {
    return null;
  }
  return record.anchors
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })
    .filter((value): value is number => value !== null);
}

export function PlayerOverlay(): JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<OverlayState>(null);
  const [clip, setClip] = React.useState<ClipResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<PlayerOpenDetail>).detail;
      if (!detail?.clipId) {
        return;
      }
      setState({ clipId: detail.clipId, tMs: detail.tMs ?? 0 });
      setOpen(true);
    };
    window.addEventListener('player:open', handleOpen as EventListener);
    return () => {
      window.removeEventListener('player:open', handleOpen as EventListener);
    };
  }, []);

  React.useEffect(() => {
    if (!open || !state?.clipId) {
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setClip(null);

    fetchClip(state.clipId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setClip(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load clip');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, state?.clipId]);

  const rawVideoUrl = React.useMemo(() => resolveVideoUrl(clip), [clip]);
  const anchors = React.useMemo(() => resolveAnchors(clip), [clip]);
  const signed = useSignedVideoSource(rawVideoUrl);
  const signing = signed.loading;

  const handleClose = () => {
    setOpen(false);
    setState(null);
    setClip(null);
    setError(null);
    setLoading(false);
  };

  const clipId = state?.clipId ?? null;
  const startMs = state?.tMs ?? 0;

  if (!open || !state) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Clip player"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-lg bg-slate-950/90 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close player"
          className="absolute -top-10 right-0 rounded bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900 shadow"
          onClick={handleClose}
        >
          Close
        </button>
        <div className="space-y-3">
          {error ? (
            <div className="rounded border border-rose-500/40 bg-rose-500/20 px-3 py-2 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
          {loading || signing ? (
            <div className="flex h-64 items-center justify-center rounded border border-slate-800 bg-slate-900 text-sm text-slate-300">
              Loading clip…
            </div>
          ) : signed.url && clipId ? (
            <ClipPlayer
              key={clipId}
              clipId={clipId}
              src={signed.url}
              anchors={anchors}
              poster={clip?.thumbnailUrl ?? clip?.thumbnail_url ?? null}
              startMs={startMs}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded border border-slate-800 bg-slate-900 text-sm text-slate-300">
              {signed.error === 'sign_failed'
                ? 'Unable to load signed video'
                : 'Clip unavailable'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

