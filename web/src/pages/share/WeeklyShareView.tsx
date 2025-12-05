import { GOLFIQ_DOWNLOAD_URL } from "@/config/shareConfig";

export type WeeklyShareData = {
  period?: { from?: string | null; to?: string | null } | null;
  roundCount?: number | null;
  avgScore?: number | null;
  headline?: string | null;
  highlights?: string[];
};

function formatPeriod(period?: { from?: string | null; to?: string | null } | null): string | undefined {
  if (!period?.from && !period?.to) return undefined;
  const fromDate = period?.from ? new Date(period.from) : null;
  const toDate = period?.to ? new Date(period.to) : null;
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  if (fromDate && toDate && !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
    return `${formatter.format(fromDate)} – ${formatter.format(toDate)}`;
  }
  if (fromDate && !Number.isNaN(fromDate.getTime())) return formatter.format(fromDate);
  if (toDate && !Number.isNaN(toDate.getTime())) return formatter.format(toDate);
  return undefined;
}

export function WeeklyShareView({ data }: { data: WeeklyShareData }) {
  const subtitleParts = [
    typeof data.roundCount === "number" ? `Rounds: ${data.roundCount}` : null,
    typeof data.avgScore === "number" ? `Avg score: ${Math.round(data.avgScore)}` : null,
    formatPeriod(data.period),
  ].filter(Boolean);

  const highlights = data.highlights?.filter(Boolean) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl bg-slate-900/80 p-6 shadow-2xl ring-1 ring-slate-800">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30">
          📈
        </div>
        <div>
          <div className="text-sm uppercase tracking-wide text-slate-400">GolfIQ</div>
          <div className="text-lg font-semibold text-slate-50">Weekly performance</div>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-50">Your week in review</h1>
        {subtitleParts.length > 0 && (
          <p className="text-sm text-slate-300">{subtitleParts.join(" · ")}</p>
        )}
      </div>

      {data.headline && <p className="text-base font-medium text-slate-100">{data.headline}</p>}

      {highlights.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Highlights
          </div>
          <ul className="list-disc space-y-1 pl-5 text-slate-100">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-3">
        <a
          href={GOLFIQ_DOWNLOAD_URL}
          className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-amber-300"
          target="_blank"
          rel="noreferrer"
        >
          Get GolfIQ for your game
        </a>
        <p className="text-xs text-slate-400">
          Track rounds, uncover weekly trends, and keep improving with personalized insights.
        </p>
      </div>
    </div>
  );
}
