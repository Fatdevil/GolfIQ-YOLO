import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { sgTopShotsAlpha, sgTopShotsBeta, sgTopShotsGamma } from '@web/config';

import { ClipModal } from '../../../features/clips/ClipModal';
import { ClipCard } from '../../../features/clips/ClipCard';
import {
  getEventTopShots,
  type TopShotClip,
} from '../../../features/clips/metricsApi';
import { rankTopShotsClient } from '../../../features/clips/rankingClient';
import { useEventSession } from '../../../session/eventSession';

export default function EventTopShotsPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const session = useEventSession();
  const memberId = useMemo(() => (session && 'memberId' in session ? (session as { memberId?: string }).memberId : undefined), [
    session,
  ]);

  const [clips, setClips] = useState<TopShotClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TopShotClip | null>(null);

  const load = useCallback(async () => {
    if (!eventId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getEventTopShots(eventId, memberId ?? null, {
        alpha: sgTopShotsAlpha,
        beta: sgTopShotsBeta,
        gamma: sgTopShotsGamma,
      });
      const missingScore = response.some((clip) => typeof clip.score !== 'number' || !Number.isFinite(clip.score));
      const ranked = missingScore ? rankTopShotsClient(response, Date.now()) : [...response].sort((a, b) => b.score - a.score);
      setClips(ranked);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load top shots';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [eventId, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-100">Top Shots</h1>
        <p className="text-sm text-slate-400">Ranked by reactions, strokes-gained impact and recency.</p>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {clips.length === 0 && !loading ? (
          <div className="col-span-full rounded border border-dashed border-slate-700 p-6 text-center text-slate-400">
            No clips ranked yet.
          </div>
        ) : null}
        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} onSelect={() => setSelected(clip)} />
        ))}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-slate-950 shadow-xl">
            <ClipModal clip={selected} onClose={() => setSelected(null)} onRefetch={load} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
