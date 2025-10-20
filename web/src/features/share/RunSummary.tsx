import { useMemo } from "react";
import type { RunKind } from "../../lib/fetchRun";

export type HudSample = Record<string, unknown>;

export interface HudSummary {
  sampleCount: number;
  durationSeconds?: number;
  averageFps?: number;
  latencyP95Ms?: number;
  pinAverageMeters?: number;
  pinBestMeters?: number;
  recenterCount?: number;
}

export interface RoundHoleSummary {
  index: number;
  par?: number;
  strokes?: number;
  gir?: boolean | null;
  fir?: boolean | null;
}

export interface RoundSummary {
  courseName?: string;
  totalStrokes?: number;
  totalPar?: number | null;
  holes: RoundHoleSummary[];
  girMade?: number;
  firHit?: number;
}

export type ShareableRunSummary =
  | { kind: "hud"; summary: HudSummary }
  | { kind: "round"; summary: RoundSummary }
  | null;

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function extractTimestamp(sample: HudSample): number | null {
  const candidates = [
    sample["timestamp"],
    sample["timestampMs"],
    sample["timestamp_ms"],
    sample["ts"],
    sample["time"],
    sample["t"],
  ];

  for (const candidate of candidates) {
    if (candidate instanceof Date) {
      return candidate.getTime();
    }
    const numeric = getNumber(candidate);
    if (numeric !== undefined) {
      if (numeric > 10_000_000_000) {
        return numeric;
      }
      return numeric * 1000;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function collectFromSamples(
  samples: HudSample[],
  keys: string[],
): number[] {
  const values: number[] = [];
  samples.forEach((sample) => {
    keys.forEach((key) => {
      if (sample[key] !== undefined) {
        const value = getNumber(sample[key]);
        if (value !== undefined) {
          values.push(value);
        }
      }
      const nested = sample["data"];
      if (nested && typeof nested === "object") {
        const nestedRecord = nested as Record<string, unknown>;
        if (nestedRecord[key] !== undefined) {
          const nestedValue = getNumber(nestedRecord[key]);
          if (nestedValue !== undefined) {
            values.push(nestedValue);
          }
        }
      }
    });
  });
  return values;
}

function countRecenter(samples: HudSample[]): number {
  let count = 0;
  samples.forEach((sample) => {
    const fields = ["event", "type", "name", "action"] as const;
    for (const field of fields) {
      const value = sample[field];
      if (typeof value === "string" && value.toLowerCase().includes("recenter")) {
        count += 1;
        return;
      }
    }
    const nested = sample["data"];
    if (nested && typeof nested === "object") {
      const nestedRecord = nested as Record<string, unknown>;
      const nestedFields = ["event", "type", "name"] as const;
      for (const field of nestedFields) {
        const value = nestedRecord[field];
        if (typeof value === "string" && value.toLowerCase().includes("recenter")) {
          count += 1;
          return;
        }
      }
      if (nestedRecord["recenter"] === true) {
        count += 1;
      }
    }
  });
  return count;
}

export function buildHudSummary(payload: unknown): HudSummary | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const samples = payload.filter((entry): entry is HudSample => !!entry && typeof entry === "object");
  const sampleCount = samples.length;
  if (!sampleCount) {
    return { sampleCount: 0 };
  }

  const timestamps = samples
    .map((sample) => extractTimestamp(sample))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const durationSeconds =
    timestamps.length >= 2 ? Math.max(0, (timestamps.at(-1)! - timestamps[0]) / 1000) : undefined;

  const averageFps = average(collectFromSamples(samples, ["avg_fps", "fps", "frameRate"]));
  const latencyP95Ms = average(
    collectFromSamples(samples, ["latency_ms_p95", "latencyP95", "p95_latency_ms", "latencyP95Ms"]),
  );

  const pinDistances = collectFromSamples(samples, [
    "pin_distance_m",
    "pinDistance",
    "pinDistanceMeters",
    "pin_distance",
    "pinMeters",
  ]);
  const pinAverageMeters = average(pinDistances);
  const pinBestMeters = pinDistances.length ? Math.min(...pinDistances) : undefined;

  const recenterCount = countRecenter(samples);

  return {
    sampleCount,
    durationSeconds,
    averageFps,
    latencyP95Ms,
    pinAverageMeters,
    pinBestMeters,
    recenterCount,
  };
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

export function buildRoundSummary(payload: unknown): RoundSummary | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const holes = Array.isArray(record["holes"]) ? record["holes"] : [];
  const courseName = getCourseName(record);

  const parsedHoles: RoundHoleSummary[] = [];
  holes.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const holeRecord = raw as Record<string, unknown>;
    const par = getNumber(holeRecord["par"] ?? holeRecord["expected"] ?? holeRecord["parScore"]);
    const strokes = getNumber(
      holeRecord["strokes"] ?? holeRecord["score"] ?? holeRecord["strokesTaken"] ?? holeRecord["total"],
    );
    const gir = extractBooleanFlag(holeRecord, [
      "gir",
      "greenInRegulation",
      "green_in_regulation",
      "greensInRegulation",
    ]);
    const fir = extractBooleanFlag(holeRecord, [
      "fir",
      "fairwayInRegulation",
      "fairway_in_regulation",
      "fairwayHit",
      "fairway_hit",
    ]);

    const heuristicGir =
      gir !== null
        ? gir
        : inferGirFromScores({
            strokes,
            par,
            putts: getNumber(
              holeRecord["putts"] ?? holeRecord["puttsTaken"] ?? holeRecord["putts_count"] ?? holeRecord["puttCount"],
            ),
          });

    const heuristicFir = fir !== null ? fir : inferFirFromHole(holeRecord, par);

    parsedHoles.push({
      index: index + 1,
      par,
      strokes,
      gir: heuristicGir,
      fir: heuristicFir,
    });
  });

  const totalStrokes = sum(parsedHoles.map((hole) => hole.strokes));
  const totalPar = sum(parsedHoles.map((hole) => hole.par));
  const girMade = parsedHoles.filter((hole) => hole.gir === true).length;
  const firHit = parsedHoles.filter((hole) => hole.fir === true).length;

  return {
    courseName,
    totalStrokes,
    totalPar,
    holes: parsedHoles,
    girMade,
    firHit,
  };
}

function getCourseName(record: Record<string, unknown>): string | undefined {
  const direct = record["course"];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  if (direct && typeof direct === "object") {
    const maybeName = (direct as Record<string, unknown>)["name"];
    if (typeof maybeName === "string" && maybeName.trim()) {
      return maybeName.trim();
    }
  }
  const metadata = record["metadata"];
  if (metadata && typeof metadata === "object") {
    const name = (metadata as Record<string, unknown>)["course"];
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }
  return undefined;
}

function extractBooleanFlag(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    if (key in record) {
      const value = getBoolean(record[key]);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return null;
}

function inferGirFromScores({
  strokes,
  par,
  putts,
}: {
  strokes?: number;
  par?: number;
  putts?: number;
}): boolean | null {
  if (strokes === undefined || par === undefined) {
    return null;
  }
  if (putts !== undefined) {
    return strokes - putts <= par - 2;
  }
  return strokes <= par;
}

function inferFirFromHole(holeRecord: Record<string, unknown>, par?: number): boolean | null {
  if (par !== undefined && par <= 3) {
    return null;
  }
  const teeResult = holeRecord["teeShot"] ?? holeRecord["tee_shot"] ?? holeRecord["drive"];
  if (teeResult && typeof teeResult === "object") {
    const teeRecord = teeResult as Record<string, unknown>;
    const flag = extractBooleanFlag(teeRecord, ["fir", "fairwayInRegulation", "fairway_hit", "fairwayHit"]);
    if (flag !== null) {
      return flag;
    }
    const lie = teeRecord["lie"] ?? teeRecord["result"];
    if (typeof lie === "string") {
      const lower = lie.toLowerCase();
      if (lower.includes("fairway")) return true;
      if (lower.includes("rough") || lower.includes("penalty")) return false;
    }
  }
  const lie = holeRecord["tee_lie"] ?? holeRecord["teeLie"] ?? holeRecord["lie"];
  if (typeof lie === "string") {
    const lower = lie.toLowerCase();
    if (lower.includes("fairway")) return true;
    if (lower.includes("rough") || lower.includes("penalty") || lower.includes("out")) return false;
  }
  return null;
}

function sum(values: Array<number | undefined>): number | undefined {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!filtered.length) return undefined;
  return filtered.reduce((acc, value) => acc + value, 0);
}

export function buildShareableSummary(kind: RunKind, payload: unknown): ShareableRunSummary {
  if (kind === "hud") {
    const summary = buildHudSummary(payload);
    return summary ? { kind, summary } : null;
  }
  if (kind === "round") {
    const summary = buildRoundSummary(payload);
    return summary ? { kind, summary } : null;
  }
  return null;
}

export function describeSummary(summary: ShareableRunSummary): string {
  if (!summary) {
    return "Shared GolfIQ run";
  }
  if (summary.kind === "hud") {
    const parts: string[] = ["HUD session"];
    if (summary.summary.durationSeconds) {
      parts.push(`${formatDuration(summary.summary.durationSeconds)} runtime`);
    }
    if (summary.summary.averageFps) {
      parts.push(`${summary.summary.averageFps.toFixed(1)} FPS avg`);
    }
    if (summary.summary.latencyP95Ms) {
      parts.push(`p95 ${Math.round(summary.summary.latencyP95Ms)} ms latency`);
    }
    return parts.join(" · ");
  }
  const { summary: round } = summary;
  const pieces: string[] = [];
  if (round.courseName) {
    pieces.push(round.courseName);
  }
  if (round.totalStrokes !== undefined && round.totalPar !== undefined) {
    pieces.push(`${round.totalStrokes} / ${round.totalPar}`);
  } else if (round.totalStrokes !== undefined) {
    pieces.push(`${round.totalStrokes} strokes`);
  }
  if (round.girMade !== undefined && round.girMade > 0) {
    pieces.push(`${round.girMade} GIR`);
  }
  if (round.firHit !== undefined && round.firHit > 0) {
    pieces.push(`${round.firHit} FIR`);
  }
  if (!pieces.length) {
    pieces.push("Round summary");
  }
  return pieces.join(" · ");
}

interface RunSummaryProps {
  id: string;
  payload: unknown;
  summary: ShareableRunSummary;
}

export function RunSummary({ id, payload, summary }: RunSummaryProps) {
  const content = useMemo(() => {
    if (!summary) {
      return null;
    }
    if (summary.kind === "hud") {
      return <HudSummaryCard id={id} summary={summary.summary} sampleCount={(payload as HudSample[])?.length ?? 0} />;
    }
    if (summary.kind === "round") {
      return <RoundSummaryCard summary={summary.summary} />;
    }
    return null;
  }, [id, payload, summary]);

  if (!content) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <p className="text-sm text-slate-300">No summary metrics available for this run.</p>
      </div>
    );
  }

  return content;
}

function HudSummaryCard({ id, summary, sampleCount }: { id: string; summary: HudSummary; sampleCount: number }) {
  return (
    <section aria-labelledby="hud-summary-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="hud-summary-title" className="text-lg font-semibold text-white">
            HUD session
          </h2>
          <p className="text-sm text-slate-300">{id}</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          {sampleCount} samples
        </span>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Metric label="Duration" value={summary.durationSeconds ? formatDuration(summary.durationSeconds) : "—"} />
        <Metric label="Average FPS" value={formatNumber(summary.averageFps, 1)} />
        <Metric label="p95 latency" value={summary.latencyP95Ms ? `${Math.round(summary.latencyP95Ms)} ms` : "—"} />
        <Metric
          label="Pin distance"
          value={
            summary.pinAverageMeters
              ? `${summary.pinAverageMeters.toFixed(1)} m avg${
                  summary.pinBestMeters !== undefined ? ` · best ${summary.pinBestMeters.toFixed(1)} m` : ""
                }`
              : "—"
          }
        />
        <Metric label="Re-center" value={summary.recenterCount !== undefined ? summary.recenterCount.toString() : "—"} />
      </dl>
    </section>
  );
}

function RoundSummaryCard({ summary }: { summary: RoundSummary }) {
  const girTotal = summary.holes.filter((hole) => hole.gir !== null).length;
  const firTotal = summary.holes.filter((hole) => hole.fir !== null).length;
  const girRate = girTotal ? Math.round(((summary.girMade ?? 0) / girTotal) * 100) : null;
  const firRate = firTotal ? Math.round(((summary.firHit ?? 0) / firTotal) * 100) : null;

  return (
    <section aria-labelledby="round-summary-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
      <div className="mb-6 space-y-2">
        <h2 id="round-summary-title" className="text-lg font-semibold text-white">
          Round summary
        </h2>
        {summary.courseName && <p className="text-sm text-slate-300">{summary.courseName}</p>}
        <p className="text-sm text-slate-200">
          {summary.totalStrokes !== undefined ? `${summary.totalStrokes} strokes` : ""}
          {summary.totalPar !== undefined ? ` · Par ${summary.totalPar}` : ""}
        </p>
      </div>
      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Metric label="GIR" value={girRate !== null ? `${girRate}%` : "—"} />
        <Metric label="FIR" value={firRate !== null ? `${firRate}%` : "—"} />
        <Metric label="GIR made" value={summary.girMade !== undefined ? summary.girMade.toString() : "—"} />
        <Metric label="FIR hit" value={summary.firHit !== undefined ? summary.firHit.toString() : "—"} />
      </dl>
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Strokes per hole</h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {summary.holes.map((hole) => (
            <div key={hole.index} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Hole {hole.index}</p>
              <p className="text-base font-semibold text-white">
                {hole.strokes !== undefined ? hole.strokes : "—"}
                {hole.par !== undefined ? <span className="text-xs font-normal text-slate-400"> / Par {hole.par}</span> : null}
              </p>
              <div className="mt-2 flex gap-2 text-xs text-slate-400">
                {hole.gir !== null && (
                  <span className={hole.gir ? "text-emerald-300" : "text-slate-500"}>
                    GIR {hole.gir ? "✓" : "—"}
                  </span>
                )}
                {hole.fir !== null && (
                  <span className={hole.fir ? "text-sky-300" : "text-slate-500"}>
                    FIR {hole.fir ? "✓" : "—"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-base text-white">{value}</dd>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hours}h ${minutesPart.toString().padStart(2, "0")}m`;
}

function formatNumber(value: number | undefined, precision = 0): string {
  if (value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(precision);
}

export default RunSummary;
