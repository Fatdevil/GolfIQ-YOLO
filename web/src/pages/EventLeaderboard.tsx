import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { aggregateLeaderboard } from '@shared/events/scoring';
import type {
  Event,
  EventSettings,
  LeaderboardRow,
  Participant,
  ScoreRow,
  ScoringFormat,
} from '@shared/events/types';
import { listParticipants, pollScores } from '@shared/events/service';
import { recordLeaderboardViewedWeb } from '@shared/events/telemetry';
import { ensureClient, isSupabaseConfigured } from '@shared/supabase/client';
import { LiveBadge } from '@web/features/live/LiveBadge';
import { useLiveStatus } from '@web/features/live/useLiveStatus';

const DEFAULT_ALLOWANCE: Record<ScoringFormat, number> = {
  stroke: 95,
  stableford: 95,
};

function normalizeSettings(settings?: EventSettings | null): EventSettings {
  if (!settings) {
    return { scoringFormat: 'stroke', allowancePct: DEFAULT_ALLOWANCE.stroke };
  }
  const format = settings.scoringFormat ?? 'stroke';
  const allowance = Number.isFinite(settings.allowancePct ?? NaN)
    ? Math.max(0, Number(settings.allowancePct))
    : DEFAULT_ALLOWANCE[format];
  return { scoringFormat: format, allowancePct: allowance };
}

function resolveFormat(event: Event | null, leaderboard: LeaderboardRow[]): ScoringFormat {
  if (event?.settings?.scoringFormat === 'stableford') {
    return 'stableford';
  }
  if (event?.settings?.scoringFormat === 'stroke') {
    return 'stroke';
  }
  const fromRows = leaderboard.find((row) => row.format)?.format;
  if (fromRows === 'stableford' || fromRows === 'stroke') {
    return fromRows;
  }
  return leaderboard.some((row) => row.hasStableford) ? 'stableford' : 'stroke';
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escapeCell = (value: string | number): string => {
    const cell = String(value ?? '');
    if (cell.includes('"') || cell.includes(',') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}

export default function EventLeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const liveStatus = useLiveStatus(id ?? null, { pollMs: 10000 });

  useEffect(() => {
    if (!id) {
      setError("Missing event id");
      setLoading(false);
      return;
    }
    let active = true;
    let stopPolling: (() => void) | null = null;

    const run = async () => {
      if (!isSupabaseConfigured()) {
        setConfigured(false);
        setLoading(false);
        return;
      }
      const client = await ensureClient();
      if (!client) {
        setConfigured(false);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data: eventRows, error: eventError } = await client
          .from("events")
          .select("id,name,code,status,start_at,settings")
          .eq("id", id)
          .limit(1);
        if (eventError || !eventRows || (Array.isArray(eventRows) && eventRows.length === 0)) {
          setError("Event not found");
          setLoading(false);
          return;
        }
        const eventRaw = (Array.isArray(eventRows) ? eventRows[0] : eventRows) as Event;
        const eventRecord: Event = {
          ...eventRaw,
          settings: normalizeSettings(eventRaw.settings),
        };
        setEvent(eventRecord);

        const participantRows = await listParticipants(eventRecord.id);

        const nameMap: Record<string, string> = {};
        const hcpMap: Record<string, number | undefined | null> = {};
        const participantMap: Record<string, Participant> = {};
        for (const row of participantRows) {
          if (row && typeof row.user_id === "string") {
            const participant: Participant = {
              event_id: row.event_id,
              user_id: row.user_id,
              display_name: row.display_name ?? "Player",
              hcp_index: row.hcp_index ?? null,
              round_id: row.round_id ?? null,
            };
            participantMap[row.user_id] = participant;
            nameMap[row.user_id] = participant.display_name;
            hcpMap[row.user_id] = participant.hcp_index ?? 0;
          }
        }
        if (active) {
          setParticipants({ ...participantMap });
          recordLeaderboardViewedWeb(eventRecord.id);
        }

        const formatForEvent = eventRecord.settings?.scoringFormat;
        stopPolling = await pollScores(id, (rows: ScoreRow[]) => {
          if (!active) {
            return;
          }
          const holesPlayed: Record<string, number> = {};
          for (const row of rows) {
            holesPlayed[row.user_id] = (holesPlayed[row.user_id] ?? 0) + 1;
            if (!nameMap[row.user_id]) {
              const known = participantMap[row.user_id];
              if (known) {
                nameMap[row.user_id] = known.display_name;
                hcpMap[row.user_id] = known.hcp_index ?? 0;
              }
            }
            if (!participantMap[row.user_id]) {
              const fallback: Participant = {
                event_id: id,
                user_id: row.user_id,
                display_name: nameMap[row.user_id] ?? `Player ${row.user_id.slice(0, 4)}`,
                hcp_index: null,
                round_id: null,
              };
              participantMap[row.user_id] = fallback;
              hcpMap[row.user_id] = 0;
              setParticipants((prev) => ({ ...prev, [row.user_id]: fallback }));
            }
          }
          const board = aggregateLeaderboard(rows, nameMap, {
            hcpIndexByUser: hcpMap,
            holesPlayedByUser: holesPlayed,
            format: formatForEvent,
          });
          setLeaderboard(board);
        }, 8000);
      } catch (loadError) {
        if (active) {
          console.warn("[EventLeaderboard] failed to load", loadError);
          setError("Unable to load event");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
      if (stopPolling) {
        stopPolling();
      }
    };
  }, [id]);

  const shareUrl = useMemo(() => {
    if (!id) {
      return "";
    }
    if (typeof window === "undefined") {
      return `/event/${id}`;
    }
    return `${window.location.origin}/event/${id}`;
  }, [id]);

  const activeFormat = useMemo(() => resolveFormat(event, leaderboard), [event, leaderboard]);
  const allowance = useMemo(() => event?.settings?.allowancePct ?? DEFAULT_ALLOWANCE[activeFormat], [
    event,
    activeFormat,
  ]);
  const showStableford = activeFormat === 'stableford';
  const showPlayingHandicap = useMemo(
    () => leaderboard.some((row) => row.playing_handicap !== undefined && row.playing_handicap !== null),
    [leaderboard],
  );
  const sortColumnLabel = showStableford ? 'Pts' : 'Net';
  const sortIndicator = showStableford ? '↓' : '↑';
  const formatLabel = activeFormat === 'stableford' ? 'Stableford' : 'Stroke';
  const allowanceLabel = `${allowance}%`;

  const handleDownloadCsv = useCallback(() => {
    if (leaderboard.length === 0 || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const headers = showStableford
      ? ['rank', 'name', 'points', 'gross', 'ph', 'holes']
      : ['rank', 'name', 'gross', 'net', 'ph', 'holes', 'toPar'];
    const rows = leaderboard.map((row, index) => {
      const ph = row.playing_handicap ?? '';
      if (showStableford) {
        return [
          index + 1,
          row.display_name,
          row.stableford ?? '',
          row.gross,
          ph === '' ? '' : ph,
          row.holes,
        ];
      }
      const toParValue =
        typeof row.toPar === 'number'
          ? row.toPar > 0
            ? `+${row.toPar}`
            : `${row.toPar}`
          : '';
      return [
        index + 1,
        row.display_name,
        row.gross,
        row.net,
        ph === '' ? '' : ph,
        row.holes,
        toParValue,
      ];
    });
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = event?.name?.replace?.(/[^a-z0-9]+/gi, '_') ?? 'leaderboard';
    const fileLabel = `${safeName}_${showStableford ? 'stableford' : 'stroke'}.csv`.replace(/_+/g, '_');
    link.download = fileLabel.toLowerCase();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [event?.name, leaderboard, showStableford]);

  if (!configured) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Event leaderboard</h1>
        <p className="text-slate-400">Supabase is not configured for this environment.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Event leaderboard</h1>
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Event leaderboard</h1>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{event.name}</h1>
          <LiveBadge
            eventId={event.id ?? id ?? null}
            running={liveStatus.running}
            viewers={liveStatus.viewers}
            startedAt={liveStatus.startedAt}
          />
        </div>
        <p className="text-slate-400">
          Event code <span className="font-mono text-slate-100">{event.code}</span>
        </p>
        <p className="text-slate-500">Share link: {shareUrl}</p>
      </header>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Leaderboard</h2>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-200">
              {formatLabel} ({allowanceLabel})
            </span>
          </div>
          {leaderboard.length ? (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              Download CSV
            </button>
          ) : null}
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-slate-400">No scores yet. Check back soon.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-300">Player</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">Gross</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">
                    <span className="inline-flex items-center justify-end gap-1">
                      {sortColumnLabel}
                      <span aria-hidden="true" className="text-xs text-slate-500">
                        {sortIndicator}
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">PH</th>
                  {!showStableford ? (
                    <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">To Par</th>
                  ) : null}
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">Holes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                {leaderboard.map((row) => {
                  const phValue =
                    row.playing_handicap !== undefined && row.playing_handicap !== null
                      ? row.playing_handicap
                      : '—';
                  const toParDisplay =
                    typeof row.toPar === 'number'
                      ? row.toPar > 0
                        ? `+${row.toPar}`
                        : row.toPar
                      : '—';
                  return (
                    <tr key={row.user_id}>
                      <td className="px-4 py-2 text-sm text-slate-100">
                        <div className="flex items-center justify-between gap-3">
                          <span>{row.display_name}</span>
                          {showPlayingHandicap &&
                          row.playing_handicap !== null &&
                          row.playing_handicap !== undefined ? (
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                              PH {row.playing_handicap}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-slate-100">{row.gross}</td>
                      <td className="px-4 py-2 text-right text-sm text-slate-100">
                        {showStableford ? (row.stableford ?? '—') : row.net}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-slate-100">{phValue}</td>
                      {!showStableford ? (
                        <td className="px-4 py-2 text-right text-sm text-slate-100">{toParDisplay}</td>
                      ) : null}
                      <td className="px-4 py-2 text-right text-sm text-slate-100">{row.holes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-2 text-xs text-slate-500">
              WHS allowance {allowanceLabel}
            </div>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Participants</h2>
        {Object.keys(participants).length === 0 ? (
          <p className="text-slate-400">No participants yet.</p>
        ) : (
          <ul className="space-y-2">
            {Object.values(participants).map((participant) => (
              <li key={participant.user_id} className="rounded border border-slate-800 px-4 py-2">
                <p className="text-sm text-slate-100">{participant.display_name}</p>
                {participant.hcp_index !== null && participant.hcp_index !== undefined ? (
                  <p className="text-xs text-slate-500">Handicap: {participant.hcp_index}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
