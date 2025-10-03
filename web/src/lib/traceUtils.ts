export type TracePoint = {
  x: number;
  y: number;
  t?: number;
  frame?: number;
  [key: string]: unknown;
};

export type TraceData = {
  width: number;
  height: number;
  points: TracePoint[];
  apexIndex?: number;
  landingIndex?: number;
  normalized?: boolean;
};

export type GhostFrame = {
  label: string;
  timestampMs?: number;
  frameIndex?: number;
  index?: number;
  sampleIndex?: number;
  position?: { x?: number; y?: number } | null;
  [key: string]: unknown;
};

export type BackViewPayload = {
  trace?: TraceData;
  ghostFrames?: GhostFrame[];
  quality?: Record<string, string | undefined> | null;
  source?: string | null;
  videoUrl?: string | null;
};

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNormalizedPoints = (points: TracePoint[]): boolean =>
  points.length > 0 &&
  points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);

export const getBounds = (points: TracePoint[]): Bounds => {
  if (!points.length) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
};

export const mapPointToCanvas = (
  point: TracePoint,
  canvasWidth: number,
  canvasHeight: number,
  bounds: Bounds,
  normalized: boolean
) => {
  if (normalized) {
    return {
      x: point.x * canvasWidth,
      y: canvasHeight - point.y * canvasHeight,
    };
  }

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);

  return {
    x: ((point.x - bounds.minX) / width) * canvasWidth,
    y: canvasHeight - ((point.y - bounds.minY) / height) * canvasHeight,
  };
};

const controlPoint = (
  current: { x: number; y: number },
  previous: { x: number; y: number } | undefined,
  next: { x: number; y: number } | undefined,
  reverse: boolean,
  smoothing: number
) => {
  const p = previous ?? current;
  const n = next ?? current;
  const o = { x: n.x - p.x, y: n.y - p.y };
  const length = Math.sqrt(o.x * o.x + o.y * o.y);
  const angle = Math.atan2(o.y, o.x) + (reverse ? Math.PI : 0);
  const controlLength = length * smoothing;
  return {
    x: current.x + Math.cos(angle) * controlLength,
    y: current.y + Math.sin(angle) * controlLength,
  };
};

export const createSmoothPath = (
  points: TracePoint[],
  canvasWidth: number,
  canvasHeight: number,
  smoothing = 0.18,
  providedBounds?: Bounds,
  normalizedOverride?: boolean
): { path: string; mapped: { x: number; y: number }[]; bounds: Bounds; normalized: boolean } => {
  if (!points.length) {
    return { path: "", mapped: [], bounds: providedBounds ?? getBounds(points), normalized: !!normalizedOverride };
  }

  const normalized = normalizedOverride ?? isNormalizedPoints(points);
  const bounds = providedBounds ?? (normalized ? { minX: 0, maxX: 1, minY: 0, maxY: 1 } : getBounds(points));
  const mapped = points.map((pt) => mapPointToCanvas(pt, canvasWidth, canvasHeight, bounds, normalized));

  if (mapped.length === 1) {
    const [{ x, y }] = mapped;
    return { path: `M ${x} ${y}`, mapped, bounds, normalized };
  }

  const pathSegments = mapped.map((point, index, array) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    const prev = array[index - 1];
    const next = array[index + 1];
    const cps = controlPoint(prev, array[index - 2], point, false, smoothing);
    const cpe = controlPoint(point, prev, next, true, smoothing);
    return `C ${cps.x} ${cps.y} ${cpe.x} ${cpe.y} ${point.x} ${point.y}`;
  });

  return { path: pathSegments.join(" "), mapped, bounds, normalized };
};

const pickNumber = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

const toTracePoint = (value: unknown): TracePoint | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [x, y, t] = value;
    if (isFiniteNumber(x) && isFiniteNumber(y)) {
      const point: TracePoint = { x, y };
      if (isFiniteNumber(t)) point.t = t;
      return point;
    }
    return null;
  }
  if (typeof value === "object") {
    const maybePoint = value as Record<string, unknown>;
    const x =
      pickNumber(maybePoint.x) ??
      pickNumber(maybePoint.x_px) ??
      pickNumber(maybePoint.x_px_norm) ??
      pickNumber(maybePoint[0]);
    const y =
      pickNumber(maybePoint.y) ??
      pickNumber(maybePoint.y_px) ??
      pickNumber(maybePoint.y_px_norm) ??
      pickNumber(maybePoint[1]);
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      return null;
    }
    const point: TracePoint = { x, y };
    const t =
      pickNumber(maybePoint.t) ??
      pickNumber(maybePoint.ts) ??
      pickNumber(maybePoint.ms) ??
      pickNumber(maybePoint.time_ms);
    if (isFiniteNumber(t)) {
      point.t = t;
    }
    const frame = pickNumber(maybePoint.frame) ?? pickNumber(maybePoint.index);
    if (isFiniteNumber(frame)) {
      point.frame = frame;
    }
    return point;
  }
  return null;
};

const normalizeLabel = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

export const toGhostFrame = (value: unknown, index: number): GhostFrame | null => {
  if (!value) return null;
  if (typeof value === "string") {
    return { label: value };
  }
  if (typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const label = normalizeLabel(
      raw.label ?? raw.name ?? raw.key ?? raw.type ?? raw.stage,
      `Frame ${index + 1}`
    );
    const timestampMs =
      pickNumber(raw.timestampMs) ??
      pickNumber(raw.timestamp_ms) ??
      pickNumber(raw.ts) ??
      pickNumber(raw.t) ??
      pickNumber(raw.ms);
    const frameIndex =
      pickNumber(raw.frameIndex) ??
      pickNumber(raw.frame_index) ??
      pickNumber(raw.index) ??
      pickNumber(raw.sampleIndex) ??
      pickNumber(raw.sample_index);
    const positionCandidate = raw.position ?? raw.pos ?? raw.point ?? raw.xy;
    let position: { x?: number; y?: number } | null = null;
    if (positionCandidate && typeof positionCandidate === "object") {
      const record = positionCandidate as Record<string, unknown>;
      position = {
        x:
          pickNumber(record.x) ??
          pickNumber(record.x_px) ??
          pickNumber(record[0]),
        y:
          pickNumber(record.y) ??
          pickNumber(record.y_px) ??
          pickNumber(record[1]),
      };
    }
    if (!position && pickNumber(raw.x) !== undefined && pickNumber(raw.y) !== undefined) {
      position = { x: pickNumber(raw.x), y: pickNumber(raw.y) };
    }
    return {
      label,
      timestampMs: timestampMs ?? undefined,
      frameIndex: frameIndex ?? undefined,
      index: frameIndex ?? undefined,
      sampleIndex: frameIndex ?? undefined,
      position: position ?? null,
      ...raw,
    };
  }
  return null;
};

const extractGhostFrames = (payload: unknown): GhostFrame[] | undefined => {
  if (!payload) return undefined;
  if (Array.isArray(payload)) {
    const frames = payload
      .map((entry, index) => toGhostFrame(entry, index))
      .filter((entry): entry is GhostFrame => Boolean(entry));
    return frames.length ? frames : undefined;
  }
  return undefined;
};

const extractTracePoints = (source: unknown): TracePoint[] | undefined => {
  if (!source) return undefined;
  if (Array.isArray(source)) {
    const points = source
      .map((entry) => toTracePoint(entry))
      .filter((entry): entry is TracePoint => Boolean(entry));
    return points.length ? points : undefined;
  }
  if (typeof source === "object") {
    const candidate = source as Record<string, unknown>;
    const nested = candidate.points ?? candidate.samples ?? candidate.path ?? candidate.trajectory;
    return extractTracePoints(nested);
  }
  return undefined;
};

const extractApexIndex = (source: Record<string, unknown>): number | undefined => {
  const candidates = [
    source.apexIndex,
    source.apex_index,
    source.apex,
    source.apex_idx,
    source.max_index,
  ];
  for (const entry of candidates) {
    if (isFiniteNumber(entry)) return entry;
  }
  return undefined;
};

const extractLandingIndex = (source: Record<string, unknown>): number | undefined => {
  const candidates = [
    source.landingIndex,
    source.landing_index,
    source.landing,
    source.end_index,
    source.ground_index,
  ];
  for (const entry of candidates) {
    if (isFiniteNumber(entry)) return entry;
  }
  return undefined;
};

const extractQuality = (source: Record<string, unknown>): Record<string, string | undefined> | undefined => {
  const quality = source.quality ?? source.quality_flags ?? source.flags ?? source.cv_quality;
  if (!quality || typeof quality !== "object") {
    return undefined;
  }
  const qualityRecord = quality as Record<string, unknown>;
  const entries = Object.entries(qualityRecord).reduce<Record<string, string | undefined>>(
    (acc, [key, value]) => {
      if (typeof value === "string") {
        acc[key] = value;
      } else if (typeof value === "number") {
        acc[key] = value.toString();
      } else if (value != null) {
        acc[key] = String(value);
      }
      return acc;
    },
    {}
  );
  return Object.keys(entries).length ? entries : undefined;
};

export const extractBackViewPayload = (payload: unknown): BackViewPayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const backViewRaw =
    (record["back_view"] as unknown) ??
    (record["backView"] as unknown) ??
    ((record["metrics"] as Record<string, unknown> | undefined)?.["back_view"] as unknown) ??
    ((record["metrics"] as Record<string, unknown> | undefined)?.["backView"] as unknown) ??
    ((record["analysis"] as Record<string, unknown> | undefined)?.["back_view"] as unknown) ??
    ((record["analysis"] as Record<string, unknown> | undefined)?.["backView"] as unknown) ??
    record["tracer"] ??
    record["trace"];

  if (!backViewRaw || typeof backViewRaw !== "object") {
    return null;
  }

  const backView = backViewRaw as Record<string, unknown>;

  const traceSource =
    backView["tracer"] ??
    backView["trace"] ??
    backView["trajectory"] ??
    backView;

  const traceSourceRecord =
    traceSource && typeof traceSource === "object" ? (traceSource as Record<string, unknown>) : undefined;

  const points =
    extractTracePoints(traceSource) ??
    (traceSourceRecord ? extractTracePoints(traceSourceRecord["points"]) : undefined) ??
    extractTracePoints(backView["points"]);

  const backViewDimensions = backView["dimensions"] as Record<string, unknown> | undefined;

  const widthCandidate =
    pickNumber(backView["width"]) ??
    pickNumber(backView["frame_width"]) ??
    pickNumber(backView["frameWidth"]) ??
    pickNumber(backView["video_width"]) ??
    pickNumber(backView["videoWidth"]) ??
    (backViewDimensions ? pickNumber(backViewDimensions["width"]) : undefined) ??
    DEFAULT_WIDTH;

  const heightCandidate =
    pickNumber(backView["height"]) ??
    pickNumber(backView["frame_height"]) ??
    pickNumber(backView["frameHeight"]) ??
    pickNumber(backView["video_height"]) ??
    pickNumber(backView["videoHeight"]) ??
    (backViewDimensions ? pickNumber(backViewDimensions["height"]) : undefined) ??
    DEFAULT_HEIGHT;

  const apexIndex =
    traceSourceRecord ? extractApexIndex(traceSourceRecord) : extractApexIndex(backView);
  const landingIndex =
    traceSourceRecord ? extractLandingIndex(traceSourceRecord) : extractLandingIndex(backView);

  const normalized = Boolean(
    (traceSourceRecord?.["normalized"] as boolean | undefined) ??
      (backView["normalized"] as boolean | undefined)
  );

  const trace = points
    ? {
        width: widthCandidate,
        height: heightCandidate,
        points,
        apexIndex,
        landingIndex,
        normalized: normalized || undefined,
      }
    : undefined;

  const ghostFrames =
    extractGhostFrames(backView["ghosts"]) ??
    extractGhostFrames(backView["ghost_frames"]) ??
    extractGhostFrames(backView["keyframes"]) ??
    extractGhostFrames(backView["frames"]);

  const quality =
    extractQuality(backView) ??
    (traceSourceRecord ? extractQuality(traceSourceRecord) : undefined) ??
    extractQuality(record) ??
    extractQuality((record["metrics"] as Record<string, unknown> | undefined) ?? {});

  const sourceValue =
    backView["source"] ??
    backView["cv_source"] ??
    backView["pipeline"] ??
    backView["engine"];
  const source = typeof sourceValue === "string" ? sourceValue : null;
  const videoCandidate =
    backView["video"] ??
    backView["video_url"] ??
    backView["preview"] ??
    backView["preview_url"];
  const videoUrl = typeof videoCandidate === "string" ? videoCandidate : null;

  if (!trace && !ghostFrames && !quality && !videoUrl && !source) {
    return null;
  }

  return {
    trace,
    ghostFrames,
    quality: quality ?? null,
    source,
    videoUrl,
  };
};

export const formatTimestamp = (ms?: number) => {
  if (!isFiniteNumber(ms)) return undefined;
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(0)}ms`;
};

export const mphFromMps = (value?: number | null) => {
  if (!isFiniteNumber(value)) return undefined;
  return value * 2.23694;
};

export const yardsFromMeters = (value?: number | null) => {
  if (!isFiniteNumber(value)) return undefined;
  return value * 1.09361;
};
