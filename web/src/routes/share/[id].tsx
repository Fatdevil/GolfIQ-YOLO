import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { API } from "../../api";
import { describeRunKind, fetchRun, type FetchRunResult } from "../../lib/fetchRun";
import {
  RunSummary as RunSummaryCard,
  buildShareableSummary,
  type ShareableRunSummary,
} from "../../features/share/RunSummary";

interface AsyncState {
  loading: boolean;
  error: string | null;
  result: FetchRunResult | null;
  notFound: boolean;
}

export default function ShareRunPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<AsyncState>({ loading: true, error: null, result: null, notFound: false });
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (!id) {
      setState({ loading: false, error: "Missing run id", result: null, notFound: false });
      return;
    }

    const controller = new AbortController();
    setState({ loading: true, error: null, result: null, notFound: false });
    fetchRun(id, { signal: controller.signal })
      .then((result) => {
        if (!result) {
          setState({ loading: false, error: null, result: null, notFound: true });
          return;
        }
        setState({ loading: false, error: null, result, notFound: false });
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: error.message || "Unable to load run", result: null, notFound: false });
      });
    return () => {
      controller.abort();
    };
  }, [id]);

  const summary = useMemo<ShareableRunSummary>(() => {
    if (!state.result) return null;
    return buildShareableSummary(state.result.kind, state.result.data);
  }, [state.result]);

  const title = `GolfIQ – Run ${id}`;
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return location.pathname;
    }
    if (typeof document !== "undefined") {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (canonicalLink?.href) {
        return canonicalLink.href;
      }
    }
    return `${window.location.origin}${location.pathname}`;
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = title;
    }
  }, [title]);

  const openLink = `/runs/${encodeURIComponent(id)}`;
  const downloadUrl = `${API}/runs/${encodeURIComponent(id)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 2500);
    } catch (error) {
      console.warn("Failed to copy link", error);
      setCopied("error");
      setTimeout(() => setCopied("idle"), 2500);
    }
  };

  useEffect(() => {
    setCopied("idle");
  }, [id]);

  if (state.loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" aria-hidden />
        <p className="mt-6 text-sm text-slate-300">Loading run…</p>
      </div>
    );
  }

  if (state.notFound) {
    const analyzerLink = `/runs/${encodeURIComponent(id)}`;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-white">Run not found</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-300">
          We could not find a run matching <span className="font-mono text-slate-100">{id}</span>. Double-check the link or open the
          analyzer to explore other captures.
        </p>
        <Link
          to={analyzerLink}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-500/30"
        >
          Open Analyzer
        </Link>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-300">{state.error}</p>
        <button
          type="button"
          onClick={() => navigate(0)}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-500/30"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!state.result) {
    return null;
  }

  const kindLabel = describeRunKind(state.result.kind);

  return (
    <div className="flex flex-1 flex-col px-4 py-10">
      <header className="mx-auto w-full max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">Shared run</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{kindLabel}</h1>
        <p className="mt-2 text-sm text-slate-300 break-all font-mono">{id}</p>
      </header>

      <div className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-4 sm:flex-row">
        <a
          className="flex-1 rounded-full bg-emerald-500 px-5 py-3 text-center text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          href={openLink}
        >
          Open in Analyzer
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-emerald-400 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          {copied === "copied" ? "Link copied" : copied === "error" ? "Copy failed" : "Copy link"}
        </button>
        <a
          className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:border-emerald-400 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          href={downloadUrl}
          download
        >
          Download JSON
        </a>
      </div>
      <div aria-live="polite" className="sr-only">
        {copied === "copied" ? "Share link copied" : copied === "error" ? "Unable to copy link" : ""}
      </div>

      <section className="mx-auto mt-10 w-full max-w-3xl">
        <RunSummaryCard id={id} payload={state.result.data} summary={summary} />
      </section>
    </div>
  );
}
