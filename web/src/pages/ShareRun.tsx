import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { RunSummary } from "../features/share/RunSummary";
import { parseHudRun } from "../features/replay/utils/parseHudRun";
import { parseRound } from "../features/replay/utils/parseRound";
import { parseShotLog, type Shot } from "../features/replay/utils/parseShotLog";
import { fetchRun, type FetchRunResult } from "../lib/fetchRun";

function makeShareUrl(id: string | undefined): string {
  if (!id) return "";
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/share/${encodeURIComponent(id)}`;
  }
  return `/share/${encodeURIComponent(id)}`;
}

type ShareState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "hud"; runId: string; rawText: string; session: ReturnType<typeof parseHudRun>; shots: Shot[] }
  | { status: "round"; runId: string; rawText: string; round: ReturnType<typeof parseRound> };

type ShareDescription = {
  title: string;
  description: string;
  url: string;
};

function updateMetaTags(meta: ShareDescription) {
  document.title = meta.title;
  const ensureProperty = (property: string, content: string) => {
    if (!content) return;
    let tag = document.head.querySelector(`meta[property="${property}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("property", property);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  };
  const ensureName = (name: string, content: string) => {
    if (!content) return;
    let tag = document.head.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", name);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  };

  ensureName("description", meta.description);
  ensureProperty("og:title", meta.title);
  ensureProperty("og:description", meta.description);
  ensureProperty("og:url", meta.url);
}

function formatHudDescription(run: ReturnType<typeof parseHudRun>): string {
  const { summary } = run;
  const durationMs = summary.durationMs ?? null;
  let durationText = "duration n/a";
  if (durationMs && durationMs > 0) {
    const totalSeconds = Math.round(durationMs / 1000);
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationText = `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
    } else {
      durationText = `${totalSeconds}s`;
    }
  }
  const fps = summary.avgFps ? `${summary.avgFps.toFixed(1)} fps` : "fps n/a";
  const latency = summary.p95Latency ? `${Math.round(summary.p95Latency)}ms p95` : "latency n/a";
  return `HUD session · ${durationText} · ${fps} · ${latency}`;
}

function formatRoundDescription(round: ReturnType<typeof parseRound>): string {
  const score = `${round.totalScore}/${round.totalPar}`;
  const relative = round.relative === 0 ? "E" : round.relative > 0 ? `+${round.relative}` : `${round.relative}`;
  return `Round at ${round.courseId} · ${score} (${relative})`;
}

export default function ShareRunPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const shareUrl = useMemo(() => makeShareUrl(id), [id]);

  useEffect(() => {
    if (!id) {
      setState({ status: "error", message: "Run id missing from URL" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchRun(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState({ status: "not-found" });
          return;
        }
        handlePayload(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });

    function handlePayload(payload: FetchRunResult) {
      try {
        if (payload.kind === "hud") {
          const parsed = parseHudRun(payload.events);
          const shots = parseShotLog(payload.events);
          setState({ status: "hud", runId: payload.id, rawText: payload.rawText, session: parsed, shots });
          return;
        }
        const parsedRound = parseRound(payload.record);
        setState({ status: "round", runId: payload.id, rawText: payload.rawText, round: parsedRound });
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  const meta = useMemo<ShareDescription>(() => {
    const baseTitle = `GolfIQ – Run ${id ?? ""}`.trim();
    if (state.status === "hud") {
      return { title: baseTitle, description: formatHudDescription(state.session), url: shareUrl };
    }
    if (state.status === "round") {
      return { title: baseTitle, description: formatRoundDescription(state.round), url: shareUrl };
    }
    return { title: baseTitle, description: "Shared run summary", url: shareUrl };
  }, [id, shareUrl, state]);

  useEffect(() => {
    if (!meta.url) return;
    updateMetaTags(meta);
  }, [meta]);

  const handleCopy = useCallback(() => {
    if (!shareUrl) {
      setCopyState("error");
      return;
    }
    if (!navigator.clipboard) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopyState("copied");
        return;
      } catch (error) {
        setCopyState("error");
        return;
      }
    }
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("error"));
  }, [shareUrl]);

  const handleDownload = useCallback(() => {
    if (state.status !== "hud" && state.status !== "round") {
      return;
    }
    const blob = new Blob([state.rawText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.runId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [state]);

  const analyzerHref = useMemo(() => {
    if (!id) return "/qa/replay";
    return `/qa/replay?share=${encodeURIComponent(id)}`;
  }, [id]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-10 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Shared run</p>
        <h1 className="text-2xl font-semibold">Run {id}</h1>
        <p className="text-sm text-slate-400">{meta.description}</p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={analyzerHref}
          className="flex-1 rounded-md bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-emerald-950 shadow-sm transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Open in Analyzer
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-600"
        >
          {copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-600"
          disabled={state.status !== "hud" && state.status !== "round"}
        >
          Download JSON
        </button>
      </div>

      <main className="mt-10 flex-1">
        {state.status === "loading" || state.status === "idle" ? (
          <p className="text-sm text-slate-400">Loading run…</p>
        ) : state.status === "error" ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {state.message}
          </div>
        ) : state.status === "not-found" ? (
          <div className="space-y-3 rounded-md border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
            <p>We couldn&apos;t find that run. It may have expired or the link is incorrect.</p>
            <p>
              Visit the <Link className="text-emerald-400 underline" to="/qa/replay">replay analyzer</Link> to upload a capture.
            </p>
          </div>
        ) : state.status === "hud" ? (
          <RunSummary kind="hud" runId={state.runId} summary={state.session.summary} shots={state.shots} />
        ) : state.status === "round" ? (
          <RunSummary kind="round" runId={state.runId} round={state.round} />
        ) : null}
      </main>
    </div>
  );
}
