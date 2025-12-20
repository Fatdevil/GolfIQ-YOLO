import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  PlayerSessionListItem,
  SessionSummary,
} from "@/coach/api";
import { fetchPlayerSessions, fetchSessionSummary } from "@/coach/api";
import { formatSessionTimestamp } from "@/coach/utils";
import { API } from "@/api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface CoachDashboardProps {
  selectedPlayerId?: string | null;
  baseUrl?: string;
  sessionFetcher?: typeof fetchPlayerSessions;
  sessionSummaryFetcher?: typeof fetchSessionSummary;
}

export function CoachDashboard({
  selectedPlayerId,
  baseUrl = API,
  sessionFetcher = fetchPlayerSessions,
  sessionSummaryFetcher = fetchSessionSummary,
}: CoachDashboardProps) {
  const [sessions, setSessions] = useState<PlayerSessionListItem[]>([]);
  const [sessionStatus, setSessionStatus] = useState<LoadStatus>("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<LoadStatus>("idle");
  const requestIdRef = useRef(0);
  const summaryRequestRef = useRef(0);

  const playerId = useMemo(() => selectedPlayerId ?? null, [selectedPlayerId]);

  const loadSessionSummary = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      summaryRequestRef.current += 1;
      const requestId = summaryRequestRef.current;
      setSummaryStatus("loading");
      Promise.resolve(sessionSummaryFetcher(baseUrl, sessionId))
        .then((res) => {
          if (requestId !== summaryRequestRef.current) return;
          setSummary(res);
          setSummaryStatus("ready");
        })
        .catch(() => {
          if (requestId !== summaryRequestRef.current) return;
          setSummary(null);
          setSummaryStatus("error");
        });
    },
    [baseUrl, sessionSummaryFetcher],
  );

  useEffect(() => {
    if (!playerId) {
      setSessions([]);
      setSessionStatus("idle");
      setSessionError(null);
      setSelectedSessionId(null);
      setSummary(null);
      setSummaryStatus("idle");
      return;
    }

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setSessionStatus("loading");
    setSessionError(null);
    setSelectedSessionId(null);
    setSummary(null);
    setSummaryStatus("idle");

    sessionFetcher(baseUrl, playerId)
      .then((items) => {
        if (requestId !== requestIdRef.current) return;
        setSessions(items);
        setSessionStatus("ready");
      })
      .catch((err: Error) => {
        if (requestId !== requestIdRef.current) return;
        setSessions([]);
        setSessionStatus("error");
        setSessionError(err.message || "Unable to load sessions");
      });
  }, [baseUrl, playerId, sessionFetcher]);

  useEffect(() => {
    if (sessionStatus === "ready" && sessions.length > 0 && !selectedSessionId) {
      loadSessionSummary(sessions[0].sessionId);
    }
  }, [sessionStatus, sessions, selectedSessionId, loadSessionSummary]);

  const renderSessionList = () => {
    if (!playerId) {
      return <p className="text-slate-400">Select a player to view sessions.</p>;
    }

    if (sessionStatus === "loading") {
      return <p className="text-slate-300">Loading sessions…</p>;
    }

    if (sessionStatus === "error") {
      return (
        <p className="text-rose-300">
          Unable to load sessions: {sessionError ?? "Unknown error"}
        </p>
      );
    }

    if (sessions.length === 0) {
      return <p className="text-slate-300">No sessions recorded for this player yet.</p>;
    }

    return (
      <div className="space-y-2" role="list">
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            type="button"
            role="listitem"
            className="flex w-full items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2 text-left hover:border-slate-700"
            onClick={() => loadSessionSummary(session.sessionId)}
            data-testid={`session-${session.sessionId}`}
          >
            <div className="font-medium text-slate-100">
              {formatSessionTimestamp(session.startedAt)}
            </div>
            <div className="flex items-center gap-4 text-slate-200">
              <span>{session.totalShots} shots</span>
              <span>{session.onTargetShots} on-target</span>
              <span>{session.onTargetPercent.toFixed(1)}%</span>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderSummary = () => {
    if (!selectedSessionId) {
      return <p className="text-slate-400">Select a session to see details.</p>;
    }

    if (summaryStatus === "loading") {
      return <p className="text-slate-300">Loading session details…</p>;
    }

    if (summaryStatus === "error") {
      return <p className="text-rose-300">Unable to load this session.</p>;
    }

    if (!summary) {
      return null;
    }

    return (
      <div className="rounded border border-slate-700 bg-slate-900 p-3">
        <p className="text-sm text-slate-300">
          Session started {formatSessionTimestamp(summary.startedAt)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-slate-100">
          <div>
            <p className="text-xs text-slate-400">Total shots</p>
            <p className="text-lg font-semibold">{summary.totalShots}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">On-target</p>
            <p className="text-lg font-semibold">{summary.onTargetShots}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Accuracy</p>
            <p className="text-lg font-semibold">
              {summary.onTargetPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Coach Dashboard</h2>
        <p className="text-slate-400">Sessions timeline for selected player</p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Sessions</h3>
        {renderSessionList()}
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Session details</h3>
        {renderSummary()}
      </div>
    </div>
  );
}
