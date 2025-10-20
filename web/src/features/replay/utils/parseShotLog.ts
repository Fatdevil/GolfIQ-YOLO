const EARTH_RADIUS_M = 6_378_137;
const EPSILON_M = 0.1;

export type GeoPoint = {
  lat: number;
  lon: number;
};

export type ShotDeltas = {
  temp: number | null;
  alt: number | null;
  head: number | null;
  slope: number | null;
};

export type ShotRelative = {
  /** Positive values indicate shots that finished right of the aim line. */
  x: number;
  /** Positive values indicate shots that finished long of the pin. */
  y: number;
  distance: number;
};

export type Shot = {
  shotId: string;
  tStart: number | null;
  tEnd: number | null;
  durationMs: number | null;
  club: string | null;
  base_m: number | null;
  playsLike_m: number | null;
  carry_m: number | null;
  heading_deg: number | null;
  pin: GeoPoint | null;
  land: GeoPoint | null;
  deltas: ShotDeltas;
  relative: ShotRelative | null;
  notes: string | null;
};

export type DispersionStats = {
  count: number;
  meanX: number | null;
  meanY: number | null;
  stdX: number | null;
  stdY: number | null;
  avgCarry: number | null;
  stdCarry: number | null;
  pctShort: number | null;
  pctLong: number | null;
  pctLeft: number | null;
  pctRight: number | null;
};

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function pickPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const lat = pickNumber(record["lat"]);
  const lon = pickNumber(record["lon"]);
  if (lat === null || lon === null) {
    return null;
  }
  return { lat, lon };
}

function computeRelative(pin: GeoPoint, land: GeoPoint, headingDeg: number | null): ShotRelative {
  const heading = Number.isFinite(headingDeg) ? (headingDeg as number) : 0;
  const headingRad = (heading * Math.PI) / 180;
  const latRad = (pin.lat * Math.PI) / 180;
  const dLat = ((land.lat - pin.lat) * Math.PI) / 180;
  const dLon = ((land.lon - pin.lon) * Math.PI) / 180;
  const north = dLat * EARTH_RADIUS_M;
  const east = dLon * EARTH_RADIUS_M * Math.cos(latRad);
  const y = east * Math.sin(headingRad) + north * Math.cos(headingRad);
  const x = east * Math.cos(headingRad) - north * Math.sin(headingRad);
  return { x, y, distance: Math.hypot(x, y) };
}

function mean(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) {
    return values.length === 1 ? 0 : null;
  }
  const mu = mean(values);
  if (mu === null) {
    return null;
  }
  const variance = values.reduce((acc, value) => acc + (value - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentage(part: number, total: number): number | null {
  if (!total) {
    return null;
  }
  return (part / total) * 100;
}

export function parseShotLog(records: unknown): Shot[] {
  if (!Array.isArray(records)) {
    return [];
  }
  const shots: Shot[] = [];
  records.forEach((raw) => {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const record = raw as Record<string, unknown>;
    const shotIdRaw = record["shotId"];
    if (typeof shotIdRaw !== "string" || !shotIdRaw.trim()) {
      return;
    }
    const tStart = pickNumber(record["tStart"]);
    const tEnd = pickNumber(record["tEnd"]);
    const duration = tStart !== null && tEnd !== null ? tEnd - tStart : null;
    const club = pickString(record["club"]);
    const base = pickNumber(record["base_m"]);
    const playsLike = pickNumber(record["playsLike_m"]);
    const carry = pickNumber(record["carry_m"]);
    const heading = pickNumber(record["heading_deg"]);
    const deltasRaw = record["deltas"];
    const deltas: ShotDeltas = {
      temp:
        deltasRaw && typeof deltasRaw === "object"
          ? pickNumber((deltasRaw as Record<string, unknown>)["temp"])
          : null,
      alt:
        deltasRaw && typeof deltasRaw === "object"
          ? pickNumber((deltasRaw as Record<string, unknown>)["alt"])
          : null,
      head:
        deltasRaw && typeof deltasRaw === "object"
          ? pickNumber((deltasRaw as Record<string, unknown>)["head"])
          : null,
      slope:
        deltasRaw && typeof deltasRaw === "object"
          ? pickNumber((deltasRaw as Record<string, unknown>)["slope"])
          : null,
    };
    const pin = pickPoint(record["pin"]);
    const land = pickPoint(record["land"]);
    const relative = pin && land ? computeRelative(pin, land, heading) : null;
    const notes = pickString(record["notes"]);
    shots.push({
      shotId: shotIdRaw,
      tStart,
      tEnd,
      durationMs: duration,
      club,
      base_m: base,
      playsLike_m: playsLike,
      carry_m: carry,
      heading_deg: heading,
      pin,
      land,
      deltas,
      relative,
      notes,
    });
  });
  return shots;
}

export function computeDispersion(shots: Shot[]): DispersionStats {
  const withRelative = shots.filter((shot) => shot.relative !== null);
  const relativeX = withRelative.map((shot) => (shot.relative as ShotRelative).x);
  const relativeY = withRelative.map((shot) => (shot.relative as ShotRelative).y);
  const carries = shots
    .map((shot) => (typeof shot.carry_m === "number" && Number.isFinite(shot.carry_m) ? shot.carry_m : null))
    .filter((value): value is number => value !== null);
  const total = withRelative.length;
  const left = withRelative.filter((shot) => (shot.relative as ShotRelative).x < -EPSILON_M).length;
  const right = withRelative.filter((shot) => (shot.relative as ShotRelative).x > EPSILON_M).length;
  const short = withRelative.filter((shot) => (shot.relative as ShotRelative).y < -EPSILON_M).length;
  const long = withRelative.filter((shot) => (shot.relative as ShotRelative).y > EPSILON_M).length;
  return {
    count: total,
    meanX: mean(relativeX),
    meanY: mean(relativeY),
    stdX: stddev(relativeX),
    stdY: stddev(relativeY),
    avgCarry: mean(carries),
    stdCarry: stddev(carries),
    pctShort: percentage(short, total),
    pctLong: percentage(long, total),
    pctLeft: percentage(left, total),
    pctRight: percentage(right, total),
  };
}
