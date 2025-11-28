import type { HoleHud } from "@/api";

function formatDistance(value?: number | null): string {
  if (value === null || value === undefined) return "–";
  return `${Math.round(value)} m`;
}

export function HudPreviewCard({ hud }: { hud: HoleHud }) {
  const plan = hud.plan ?? "free";
  const isPro = plan === "pro";
  const playsLike = isPro ? hud.playsLike_m : null;
  const tip = isPro ? hud.activeTip : null;

  const middleDistance = hud.toGreen_m ?? hud.toFront_m ?? hud.toBack_m;

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm text-slate-400">
            Hole {hud.hole}
            {hud.par ? ` · Par ${hud.par}` : ""}
          </div>
          <div className="text-xs text-slate-500">
            {hud.courseId ? `Course ${hud.courseId}` : "Course not provided"}
          </div>
        </div>
        <span
          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200"
          aria-label={`Plan ${plan}`}
        >
          {plan.toUpperCase()}
        </span>
      </div>

      <div className="rounded-md bg-slate-800 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Distances</div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex-1">
            <div className="text-sm text-slate-400">To middle</div>
            <div className="text-3xl font-bold leading-tight text-white">
              {formatDistance(middleDistance)}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2 text-center text-sm text-slate-200">
            <div className="rounded-md bg-slate-900/60 p-2">
              <div className="text-xs uppercase text-slate-400">Front</div>
              <div className="font-semibold">{formatDistance(hud.toFront_m)}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 p-2">
              <div className="text-xs uppercase text-slate-400">Middle</div>
              <div className="font-semibold">{formatDistance(hud.toGreen_m)}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 p-2">
              <div className="text-xs uppercase text-slate-400">Back</div>
              <div className="font-semibold">{formatDistance(hud.toBack_m)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-slate-800 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Plays like</div>
        {playsLike !== null && playsLike !== undefined ? (
          <p className="mt-2 text-base font-semibold text-white">
            Plays like {formatDistance(playsLike)}
          </p>
        ) : isPro ? (
          <p className="mt-2 text-sm text-slate-400">No plays-like data available.</p>
        ) : (
          <p className="mt-2 text-sm text-amber-300">
            Upgrade to Pro to see plays-like adjustments.
          </p>
        )}
      </div>

      <div className="rounded-md bg-slate-800 p-3 space-y-1">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
          <span>Advice</span>
          {isPro && hud.caddie_confidence !== undefined && hud.caddie_confidence !== null ? (
            <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-emerald-200">
              {`Confidence ${Math.round(hud.caddie_confidence * 100)}%`}
            </span>
          ) : null}
        </div>
        {tip ? (
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">{tip.title}</div>
            <div className="text-xs text-slate-300">{tip.body}</div>
            {tip.club && (
              <div className="text-xs text-emerald-200">Suggested club: {tip.club}</div>
            )}
          </div>
        ) : isPro ? (
          <p className="text-sm text-slate-400">
            {hud.caddie_silent_reason || "No active advice for this hole."}
          </p>
        ) : (
          <p className="text-sm text-amber-300">
            Upgrade to Pro to unlock caddie advice.
          </p>
        )}
      </div>
    </div>
  );
}
