import type { HudRunSummary } from "../replay/utils/parseHudRun";
import type { Shot } from "../replay/utils/parseShotLog";
import { computeDispersion } from "../replay/utils/parseShotLog";
import type { ParsedRound } from "../replay/utils/parseRound";

type HudSummaryProps = {
  kind: "hud";
  runId: string;
  summary: HudRunSummary;
  shots: Shot[];
};

type RoundSummaryProps = {
  kind: "round";
  runId: string;
  round: ParsedRound;
};

type RunSummaryProps = HudSummaryProps | RoundSummaryProps;

function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) {
    return "–";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "–";
  }
  return new Intl.NumberFormat(undefined, options).format(value);
}

function formatRelative(value: number): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function renderHudSummary(props: HudSummaryProps) {
  const { summary, shots } = props;
  const dispersion = computeDispersion(shots);
  const distances = shots
    .map((shot) => shot.relative?.distance ?? null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const avgDistance = mean(distances);
  const maxDistance = distances.length ? Math.max(...distances) : null;
  const minDistance = distances.length ? Math.min(...distances) : null;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-slate-100">Session overview</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Duration</dt>
            <dd className="mt-1 text-base text-slate-100">{formatDuration(summary.durationMs)}</dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Avg FPS</dt>
            <dd className="mt-1 text-base text-slate-100">{formatNumber(summary.avgFps, { maximumFractionDigits: 1 })}</dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">p95 latency (ms)</dt>
            <dd className="mt-1 text-base text-slate-100">{formatNumber(summary.p95Latency, { maximumFractionDigits: 0 })}</dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Recenter events</dt>
            <dd className="mt-1 text-base text-slate-100">{summary.recenterCount}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-100">Pin distance</h3>
        {dispersion.count === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No pin-relative shots were recorded.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Avg offset (m)</dt>
              <dd className="mt-1 text-base text-slate-100">
                {dispersion.meanY === null
                  ? "–"
                  : `${formatNumber(Math.abs(dispersion.meanY), { maximumFractionDigits: 2 })} ${
                      dispersion.meanY > 0 ? "long" : dispersion.meanY < 0 ? "short" : "on"
                    }`}
              </dd>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Avg distance (m)</dt>
              <dd className="mt-1 text-base text-slate-100">
                {avgDistance === null ? "–" : formatNumber(avgDistance, { maximumFractionDigits: 2 })}
              </dd>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Short / Long</dt>
              <dd className="mt-1 text-base text-slate-100">
                {formatNumber(dispersion.pctShort, { maximumFractionDigits: 0 })}% / {formatNumber(dispersion.pctLong, {
                  maximumFractionDigits: 0,
                })}%
              </dd>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Min / Max (m)</dt>
              <dd className="mt-1 text-base text-slate-100">
                {minDistance === null || maxDistance === null
                  ? "–"
                  : `${formatNumber(minDistance, { maximumFractionDigits: 2 })} – ${formatNumber(maxDistance, {
                      maximumFractionDigits: 2,
                    })}`}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

function renderRoundSummary({ round }: RoundSummaryProps) {
  const firPct = round.firEligible ? (round.firHit / round.firEligible) * 100 : null;
  const girPct = round.girEligible ? (round.girHit / round.girEligible) * 100 : null;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-slate-100">Round overview</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Course</dt>
            <dd className="mt-1 text-base text-slate-100">{round.courseId}</dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total</dt>
            <dd className="mt-1 text-base text-slate-100">
              {round.totalScore} / {round.totalPar} ({formatRelative(round.relative)})
            </dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">FIR</dt>
            <dd className="mt-1 text-base text-slate-100">
              {firPct === null ? "–" : `${formatNumber(firPct, { maximumFractionDigits: 0 })}%`}
            </dd>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">GIR</dt>
            <dd className="mt-1 text-base text-slate-100">
              {girPct === null ? "–" : `${formatNumber(girPct, { maximumFractionDigits: 0 })}%`}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-100">Strokes per hole</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-2">
          {round.holes.map((hole) => (
            <div key={hole.holeNo} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Hole {hole.holeNo}</p>
              <p className="mt-1 text-base text-slate-100">
                {hole.score} strokes · Par {hole.par}
              </p>
              <p className="text-xs text-slate-500">
                FIR: {hole.fir === null ? "–" : hole.fir ? "Yes" : "No"} · GIR: {hole.gir === null ? "–" : hole.gir ? "Yes" : "No"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function RunSummary(props: RunSummaryProps) {
  if (props.kind === "hud") {
    return renderHudSummary(props);
  }
  return renderRoundSummary(props);
}
