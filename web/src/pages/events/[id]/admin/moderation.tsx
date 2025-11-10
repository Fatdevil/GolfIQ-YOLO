import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useEventSession } from '@web/session/eventSession';
import {
  listModerationQueue,
  moderateClip,
  type ClipModerationState,
  type Visibility,
} from '@web/features/clips/moderationApi';

const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Private',
  event: 'Event',
  friends: 'Friends',
  public: 'Public',
};

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch (err) {
    return ts;
  }
}

export default function EventClipModerationPage(): JSX.Element {
  const { id: eventId = '' } = useParams<{ id: string }>();
  const session = useEventSession();
  const { role, memberId, safe } = session;
  const isAdmin = role === 'admin';

  const [queue, setQueue] = useState<ClipModerationState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClip, setPendingClip] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const hasQueue = queue.length > 0;

  const refreshQueue = useCallback(async () => {
    if (!eventId || !isAdmin) {
      setQueue([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await listModerationQueue({
        memberId,
      });
      setQueue(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load moderation queue';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [eventId, isAdmin, memberId]);

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin) {
      setQueue([]);
      return undefined;
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    listModerationQueue({ memberId, signal: controller.signal })
      .then((payload) => {
        if (!cancelled) {
          setQueue(payload);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && !cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load moderation queue';
          setError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && !cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [eventId, isAdmin, memberId]);

  const visibilityOptions = useMemo<Visibility[]>(
    () => ['public', 'friends', 'event', 'private'],
    [],
  );

  const updateQueueEntry = useCallback(
    (updated: ClipModerationState) => {
      setQueue((prev) => {
        if (updated.reports === 0) {
          return prev.filter((item) => item.clipId !== updated.clipId);
        }
        return prev.map((item) => (item.clipId === updated.clipId ? updated : item));
      });
    },
    [],
  );

  const runAction = useCallback(
    async (clipId: string, body: { action: 'hide' | 'unhide' | 'set_visibility'; visibility?: Visibility }) => {
      if (!isAdmin) {
        return;
      }
      setPendingClip(clipId);
      setActionErrors((current) => ({ ...current, [clipId]: '' }));
      try {
        const next = await moderateClip(clipId, body, memberId);
        updateQueueEntry(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Moderation action failed';
        setActionErrors((current) => ({ ...current, [clipId]: message }));
      } finally {
        setPendingClip(null);
      }
    },
    [isAdmin, memberId, updateQueueEntry],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Clip moderation</h1>
        <p className="text-sm text-slate-400">Review reported clips and adjust visibility.</p>
      </header>

      {safe && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Tournament-safe mode is active — moderation actions are still permitted.
        </div>
      )}

      {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>}

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{hasQueue ? `${queue.length} clip(s) in queue` : 'No open reports'}</span>
        <button
          type="button"
          onClick={refreshQueue}
          disabled={loading}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="overflow-hidden rounded border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Clip</th>
              <th className="px-4 py-3 text-left">Reports</th>
              <th className="px-4 py-3 text-left">Visibility</th>
              <th className="px-4 py-3 text-left">Updated</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {queue.map((item) => {
              const pending = pendingClip === item.clipId;
              const errorMessage = actionErrors[item.clipId];
              return (
                <tr key={item.clipId} className="bg-slate-950/40">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.clipId}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200">
                      {item.reports} open
                    </span>
                    {item.hidden && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-slate-700/50 px-2 py-1 text-xs font-semibold text-slate-200">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={item.visibility}
                      onChange={(event) =>
                        runAction(item.clipId, {
                          action: 'set_visibility',
                          visibility: event.target.value as Visibility,
                        })
                      }
                      disabled={pending}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                    >
                      {visibilityOptions.map((value) => (
                        <option key={value} value={value}>
                          {VISIBILITY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatTimestamp(item.updatedTs)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runAction(item.clipId, { action: 'hide' })}
                        disabled={pending || item.hidden}
                        className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Hide
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction(item.clipId, { action: 'unhide' })}
                        disabled={pending || !item.hidden}
                        className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Unhide
                      </button>
                    </div>
                    {errorMessage && errorMessage.length > 0 && (
                      <div className="mt-2 text-xs text-rose-400">{errorMessage}</div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!hasQueue && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No reported clips at the moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
