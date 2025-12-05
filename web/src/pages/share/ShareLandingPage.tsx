import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch } from "@/api";
import { OG_FALLBACK_IMAGE_URL } from "@/config/shareConfig";
import { RoundShareView, type RoundShareData } from "./RoundShareView";
import { WeeklyShareView, type WeeklyShareData } from "./WeeklyShareView";
import { GOLFIQ_DOWNLOAD_URL } from "@/config/shareConfig";

type ShareType = "round" | "weekly" | "coach" | "anchor" | "unknown";

type ResolvedShare = {
  sid: string;
  type: ShareType;
  round?: RoundShareData | null;
  weekly?: WeeklyShareData | null;
  coach?: { summary?: Record<string, unknown> | null } | null;
  url?: string | null;
};

type ShareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "loaded"; share: ResolvedShare };

function updateMetaTags(meta: { title: string; description: string; image?: string; url?: string }) {
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
  ensureProperty("og:type", "website");
  ensureProperty("og:image", meta.image || OG_FALLBACK_IMAGE_URL);
  ensureProperty("og:url", meta.url || window.location.href);
}

async function fetchSharePayload(sid: string): Promise<ResolvedShare> {
  const response = await apiFetch(`/share/resolve/${encodeURIComponent(sid)}`);
  if (response.status === 404) {
    throw new Error("not-found");
  }
  if (!response.ok) {
    throw new Error(`Failed to load share (${response.status})`);
  }
  return (await response.json()) as ResolvedShare;
}

function getRoundDescription(round?: RoundShareData | null): string {
  if (!round) return "Round recap";
  const parts = [round.courseName, round.score ? `Score ${round.score}` : null, round.toPar];
  return parts.filter(Boolean).join(" · ") || "Round recap";
}

function getWeeklyDescription(weekly?: WeeklyShareData | null): string {
  if (!weekly) return "Weekly performance";
  const parts = [
    typeof weekly.roundCount === "number" ? `${weekly.roundCount} rounds` : null,
    typeof weekly.avgScore === "number" ? `Avg ${Math.round(weekly.avgScore)}` : null,
  ];
  return weekly.headline || parts.filter(Boolean).join(" · ") || "Weekly performance";
}

function ShareFallbackCard({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl bg-slate-900/80 p-6 text-center shadow-2xl ring-1 ring-slate-800">
      <div className="text-lg font-semibold text-slate-50">{title}</div>
      <p className="text-sm text-slate-300">
        This GolfIQ share link has expired or is not yet supported on the web.
      </p>
      <div>
        <a
          href={GOLFIQ_DOWNLOAD_URL}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-emerald-400"
          target="_blank"
          rel="noreferrer"
        >
          Download GolfIQ
        </a>
      </div>
    </div>
  );
}

export function ShareLandingPage() {
  const { sid } = useParams<{ sid: string }>();
  const [state, setState] = useState<ShareState>({ status: "loading" });

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);

  useEffect(() => {
    if (!sid) {
      setState({ status: "error", message: "Share id missing" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    fetchSharePayload(sid)
      .then((share) => {
        if (!active) return;
        setState({ status: "loaded", share });
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof Error && error.message === "not-found") {
          setState({ status: "not-found" });
          return;
        }
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      active = false;
    };
  }, [sid]);

  useEffect(() => {
    if (state.status !== "loaded") {
      updateMetaTags({
        title: "GolfIQ share",
        description: "GolfIQ performance snapshot",
        image: OG_FALLBACK_IMAGE_URL,
        url: shareUrl,
      });
      return;
    }

    const { share } = state;
    if (share.type === "round") {
      updateMetaTags({
        title: `GolfIQ · Round at ${share.round?.courseName || "your course"}`,
        description: getRoundDescription(share.round),
        image: OG_FALLBACK_IMAGE_URL,
        url: shareUrl,
      });
      return;
    }
    if (share.type === "weekly") {
      updateMetaTags({
        title: "GolfIQ · Weekly performance",
        description: getWeeklyDescription(share.weekly),
        image: OG_FALLBACK_IMAGE_URL,
        url: shareUrl,
      });
      return;
    }

    updateMetaTags({
      title: "GolfIQ share",
      description: "GolfIQ performance snapshot",
      image: OG_FALLBACK_IMAGE_URL,
      url: shareUrl,
    });
  }, [shareUrl, state]);

  let content: JSX.Element;
  if (state.status === "loading") {
    content = (
      <div className="text-center text-slate-300">Loading your GolfIQ share…</div>
    );
  } else if (state.status === "error") {
    content = <ShareFallbackCard title="Something went wrong" />;
  } else if (state.status === "not-found") {
    content = <ShareFallbackCard title="This GolfIQ share link has expired or is invalid" />;
  } else {
    const { share } = state;
    if (share.type === "round" && share.round) {
      content = <RoundShareView data={share.round} />;
    } else if (share.type === "weekly" && share.weekly) {
      content = <WeeklyShareView data={share.weekly} />;
    } else {
      content = <ShareFallbackCard title="Open this share in the GolfIQ app" />;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-12 text-slate-100">
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-emerald-400">GolfIQ</div>
        <div className="text-3xl font-semibold text-slate-50">Share preview</div>
      </div>
      {content}
    </div>
  );
}

export default ShareLandingPage;
