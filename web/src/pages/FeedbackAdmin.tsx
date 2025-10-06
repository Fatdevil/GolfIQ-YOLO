import { useEffect, useMemo, useState } from "react";

import { FeedbackItem, fetchFeedback } from "../api";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}

function renderQaSummary(summary: FeedbackItem["qaSummary"]) {
  if (!summary || typeof summary !== "object") return null;
  const record = summary as Record<string, unknown>;
  const qualityValue = record["quality"];
  const capturedValue = record["capturedAt"];

  const quality = qualityValue != null ? String(qualityValue) : "";
  const capturedAt = capturedValue != null ? String(capturedValue) : "";
  const captured = capturedAt
    ? (() => {
        const numeric = Number(capturedAt);
        if (!Number.isNaN(numeric)) {
          return formatDate(new Date(numeric).toISOString());
        }
        return capturedAt;
      })()
    : "";

  return (
    <div className="mt-2 space-y-1 text-xs text-slate-400">
      {quality && <div>QA quality: {quality}</div>}
      {captured && <div>Captured: {captured}</div>}
    </div>
  );
}

export default function FeedbackAdminPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeedback = () => {
    setLoading(true);
    setError(null);
    fetchFeedback(200)
      .then((response) => {
        setItems(response.items);
        setGeneratedAt(response.generatedAt);
      })
      .catch((err) => {
        console.error(err);
        setItems([]);
        setGeneratedAt("");
        setError("Failed to load feedback events.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.category || "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({
      category,
      count,
    }));
  }, [items]);

  const tierSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const tier = item.tier ? item.tier.toUpperCase() : "UNKNOWN";
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([tier, count]) => ({ tier, count }));
  }, [items]);

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Feedback & Bug Reports</h1>
        <p className="text-sm text-slate-400">
          Flight-recorder snapshots of in-app feedback (bugs, UI notes, accuracy concerns). Attachments include the
          latest QA summary and device tier for rapid triage.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {generatedAt ? `Generated ${formatDate(generatedAt)}` : ""}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadFeedback()}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
          <div className="text-xs uppercase text-slate-400">Categories</div>
          <div className="mt-3 space-y-2">
            {categorySummary.length === 0 && (
              <div className="text-xs text-slate-500">No feedback captured yet.</div>
            )}
            {categorySummary.map((entry) => (
              <div key={entry.category} className="flex items-center justify-between text-sm text-slate-200">
                <span className="capitalize">{entry.category}</span>
                <span className="text-xs text-slate-400">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
          <div className="text-xs uppercase text-slate-400">Device tiers</div>
          <div className="mt-3 space-y-2">
            {tierSummary.length === 0 && (
              <div className="text-xs text-slate-500">No device data yet.</div>
            )}
            {tierSummary.map((entry) => (
              <div key={entry.tier} className="flex items-center justify-between text-sm text-slate-200">
                <span>{entry.tier}</span>
                <span className="text-xs text-slate-400">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow">
        <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
          Latest submissions
        </div>
        <div className="divide-y divide-slate-800">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Loading feedback…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No feedback captured yet.</div>
          )}
          {!loading &&
            items.map((item) => {
              const qa = item.qaSummary && typeof item.qaSummary === "object" ? item.qaSummary : null;
              const sinkLabel = item.sink?.email || item.sink?.webhook;
              return (
                <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,200px)]">
                  <div className="space-y-1 text-xs text-slate-400">
                    <div className="font-semibold text-slate-200">{item.category}</div>
                    <div>{formatDate(item.timestamp)}</div>
                    <div className="text-[11px] uppercase text-slate-500">{item.device.tier}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{item.message}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.device.model} · {item.device.os}
                    </div>
                    {qa && renderQaSummary(qa)}
                  </div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div>Device ID: {item.device.id || "n/a"}</div>
                    {sinkLabel && <div>Sink: {sinkLabel}</div>}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}
