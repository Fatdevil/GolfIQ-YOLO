import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { aggregateLeaderboard } from "../../../shared/events/scoring";
import type { Event, LeaderboardRow, Participant, ScoreRow } from "../../../shared/events/types";
import { pollScores } from "../../../shared/events/service";
import { recordLeaderboardViewedWeb } from "../../../shared/events/telemetry";
import { getSupabase, isSupabaseConfigured } from "../../../shared/supabase/client";

export default function EventLeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

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
      const client = await getSupabase();
      if (!client) {
        setConfigured(false);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data: eventRows, error: eventError } = await client
          .from("events")
          .select("id,name,code,status,start_at")
          .eq("id", id)
          .limit(1);
        if (eventError || !eventRows || (Array.isArray(eventRows) && eventRows.length === 0)) {
          setError("Event not found");
          setLoading(false);
          return;
        }
        const eventRecord = (Array.isArray(eventRows) ? eventRows[0] : eventRows) as Event;
        setEvent(eventRecord);

        const { data: participantRows } = await client
          .from("event_participants")
          .select("event_id,user_id,display_name,hcp_index,round_id")
          .eq("event_id", id);

        const nameMap: Record<string, string> = {};
        const participantMap: Record<string, Participant> = {};
        if (Array.isArray(participantRows)) {
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
            }
          }
        }
        if (active) {
          setParticipants({ ...participantMap });
          recordLeaderboardViewedWeb(eventRecord.id);
        }

        stopPolling = await pollScores(id, (rows: ScoreRow[]) => {
          if (!active) {
            return;
          }
          const holesPlayed: Record<string, number> = {};
          for (const row of rows) {
            const existing = holesPlayed[row.user_id] ?? 0;
            holesPlayed[row.user_id] = Math.max(existing, row.hole_no);
            if (!nameMap[row.user_id]) {
              const known = participantMap[row.user_id];
              if (known) {
                nameMap[row.user_id] = known.display_name;
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
              setParticipants((prev) => ({ ...prev, [row.user_id]: fallback }));
            }
          }
          const board = aggregateLeaderboard(rows, nameMap, holesPlayed);
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
        <h1 className="text-3xl font-semibold">{event.name}</h1>
        <p className="text-slate-400">
          Event code <span className="font-mono text-slate-100">{event.code}</span>
        </p>
        <p className="text-slate-500">Share link: {shareUrl}</p>
      </header>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-slate-400">No scores yet. Check back soon.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-300">Player</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">Gross</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">Net</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">To Par</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-slate-300">Thru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                {leaderboard.map((row) => (
                  <tr key={row.user_id}>
                    <td className="px-4 py-2 text-sm text-slate-100">{row.display_name}</td>
                    <td className="px-4 py-2 text-right text-sm text-slate-100">{row.gross}</td>
                    <td className="px-4 py-2 text-right text-sm text-slate-100">{row.net}</td>
                    <td className="px-4 py-2 text-right text-sm text-slate-100">
                      {row.to_par > 0 ? `+${row.to_par}` : row.to_par}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-slate-100">{row.holes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
