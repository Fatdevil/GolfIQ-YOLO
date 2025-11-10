import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { postClipCommentary } from '@web/api';
import {
  getClipCommentary,
  listClipCommentaries,
  postClipCommentaryPlay,
  type ClipCommentary,
  type CommentaryStatus,
} from '@web/features/clips/api';
import { useEventSession } from '@web/session/eventSession';

const POLL_INTERVAL_MS = 4000;
const TOURNAMENT_SAFE_MESSAGE = 'Tournament-safe: commentary disabled';

const STATUS_LABELS: Record<CommentaryStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  ready: 'Ready',
  failed: 'Failed',
  blocked_safe: 'Blocked (safe)',
};

const STATUS_STYLES: Record<CommentaryStatus, string> = {
  queued: 'bg-amber-500/10 text-amber-200',
  running: 'bg-sky-500/10 text-sky-200',
  ready: 'bg-teal-500/10 text-teal-200',
  failed: 'bg-rose-500/10 text-rose-200',
  blocked_safe: 'bg-purple-500/10 text-purple-200',
};

function StatusBadge({ status }: { status: CommentaryStatus }): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatUpdated(ts: string): string {
  try {
    const date = new Date(ts);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch (err) {
    return ts;
  }
}

export default function EventClipsAdminQueue(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const session = useEventSession();
  const { role, memberId, safe } = session;

  const [clips, setClips] = useState<ClipCommentary[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [bannerSafe, setBannerSafe] = useState<boolean>(safe);
  const [requestingClip, setRequestingClip] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipCommentary | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const pollController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isAdmin = role === 'admin';
  const safeLocked = safe || bannerSafe;

  useEffect(() => {
    setBannerSafe(safe);
  }, [safe]);

  useEffect(() => {
    if (!eventId || !isAdmin) {
      setClips([]);
      return () => undefined;
    }
    let cancelled = false;
    let timer: number | null = null;
    let firstLoad = true;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      pollController.current?.abort();
      const controller = new AbortController();
      pollController.current = controller;
      if (firstLoad) {
        setLoading(true);
      }
      try {
        const next = await listClipCommentaries(eventId, {
          memberId,
          signal: controller.signal,
        });
        if (!cancelled) {
          setClips(next);
          setQueueError(null);
        }
      } catch (err) {
        if (controller.signal.aborted || cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load commentary queue';
        setQueueError(message);
      } finally {
        if (!cancelled) {
          if (firstLoad) {
            firstLoad = false;
            setLoading(false);
          }
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
      pollController.current?.abort();
    };
  }, [eventId, memberId, isAdmin]);

  useEffect(() => {
    if (!selectedClipId || !isAdmin) {
      setDetail(null);
      return () => undefined;
    }
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setDetailLoading(true);
    setDetailError(null);

    getClipCommentary(selectedClipId, memberId, controller.signal)
      .then((payload) => {
        setDetail(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load commentary details';
        setDetailError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedClipId, memberId, isAdmin]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, [detail?.clipId, detail?.ttsUrl]);

  useEffect(() => {
    return () => {
      pollController.current?.abort();
      detailController.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedClipId && clips.length > 0) {
      setSelectedClipId(clips[0].clipId);
    } else if (selectedClipId && !clips.some((clip) => clip.clipId === selectedClipId)) {
      setSelectedClipId(clips.length > 0 ? clips[0].clipId : null);
    }
  }, [clips, selectedClipId]);

  const requestableStatuses = useMemo(() => new Set<CommentaryStatus>(['queued', 'running']), []);

  const canRequest = (status: CommentaryStatus): boolean => {
    if (!isAdmin || safeLocked) {
      return false;
    }
    return !requestableStatuses.has(status);
  };

  const handleRequest = async (clip: ClipCommentary) => {
    if (!canRequest(clip.status)) {
      if (safeLocked) {
        setBannerSafe(true);
      }
      return;
    }
    setRequestingClip(clip.clipId);
    setQueueError(null);
    try {
      await postClipCommentary(clip.clipId, memberId ?? undefined);
      setBannerSafe(false);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 423) {
        setBannerSafe(true);
        setQueueError(TOURNAMENT_SAFE_MESSAGE);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to request commentary';
        setQueueError(message);
      }
    } finally {
      setRequestingClip(null);
    }
  };

  const handleSelect = (clipId: string) => {
    setSelectedClipId(clipId);
  };

  const handleToggleAudio = async () => {
    if (!detail?.ttsUrl) {
      return;
    }
    const current = audioRef.current ?? new Audio(detail.ttsUrl);
    if (current.src !== detail.ttsUrl) {
      current.pause();
      audioRef.current = new Audio(detail.ttsUrl);
    } else if (!audioRef.current) {
      audioRef.current = current;
    }
    const player = audioRef.current ?? current;
    player.onended = () => {
      setIsPlaying(false);
    };
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        await player.play();
        setIsPlaying(true);
        await postClipCommentaryPlay(detail.clipId, memberId ?? undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to play audio';
      setDetailError(message);
    }
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Commentary queue</h1>
        <p className="text-sm text-slate-400">Admin access required to manage clip commentary.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Commentary queue</h1>
        <p className="text-sm text-slate-300">Request AI commentary, monitor progress, and review generated summaries.</p>
      </header>

      {safeLocked && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {TOURNAMENT_SAFE_MESSAGE}
        </div>
      )}
      {queueError && (!safeLocked || queueError !== TOURNAMENT_SAFE_MESSAGE) && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {queueError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 shadow">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-100">Clips</h2>
            {loading && <span className="text-xs text-slate-500">Loading…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead>
                <tr className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Clip</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {clips.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                      {loading ? 'Loading clips…' : 'No commentary requests yet.'}
                    </td>
                  </tr>
                )}
                {clips.map((clip) => {
                  const selected = clip.clipId === selectedClipId;
                  return (
                    <tr
                      key={clip.clipId}
                      className={`transition hover:bg-slate-900/40 ${selected ? 'bg-slate-900/50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{clip.clipId}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={clip.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatUpdated(clip.updatedTs)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRequest(clip)}
                            disabled={requestingClip === clip.clipId || !canRequest(clip.status)}
                            className="rounded bg-teal-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                          >
                            {requestingClip === clip.clipId ? 'Requesting…' : 'Request'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelect(clip.clipId)}
                            className="rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-teal-400 hover:text-teal-200"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 shadow">
          <h2 className="text-lg font-semibold text-slate-100">Commentary</h2>
          {detailLoading && <p className="text-sm text-slate-400">Loading details…</p>}
          {detailError && <p className="text-sm text-rose-400">{detailError}</p>}
          {!detail && !detailLoading && (
            <p className="text-sm text-slate-500">Select a clip to review generated commentary.</p>
          )}
          {detail && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
                <p className="text-sm text-slate-300">{formatUpdated(detail.updatedTs)}</p>
              </div>
              {detail.title && <h3 className="text-xl font-semibold text-slate-100">{detail.title}</h3>}
              {detail.summary && <p className="text-sm leading-relaxed text-slate-300">{detail.summary}</p>}
              {detail.ttsUrl && (
                <button
                  type="button"
                  onClick={handleToggleAudio}
                  className="self-start rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                >
                  {isPlaying ? 'Pause voice-over' : 'Play voice-over'}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
