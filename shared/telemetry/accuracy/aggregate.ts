export type AccuracyRow = {
  ts: number;
  roundId?: string;
  hole?: number;
  club?: string;
  tp: number;
  fp: number;
  fn: number;
  distance_m?: number;
  [k: string]: unknown;
};

export type BinKey = string;

type Triplet = { tp: number; fp: number; fn: number };
type TripletWithMetrics = Triplet & {
  precision: number;
  recall: number;
  f1: number;
};

export type Aggregates = {
  totals: TripletWithMetrics;
  byHole: Record<number, TripletWithMetrics>;
  byClub: Record<string, TripletWithMetrics>;
  byDistance: Record<string, TripletWithMetrics>;
  byDate: Record<string, Triplet>;
};

export function parseNdjson(text: string): AccuracyRow[] {
  const out: AccuracyRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;

      const tsSource =
        parsed?.ts ??
        parsed?.timestampMs ??
        (typeof data?.ts === "number" || typeof data?.ts === "string" ? data.ts : undefined);
      let ts = Number(tsSource ?? Date.now());
      if (!Number.isFinite(ts)) {
        ts = Date.now();
      }

      const tp = Number((data as Record<string, unknown>)?.tp ?? 0);
      const fp = Number((data as Record<string, unknown>)?.fp ?? 0);
      const fnSource =
        (data as Record<string, unknown>)?.fnn ??
        (data as Record<string, unknown>)?.fn ??
        0;
      const fn = Number(fnSource ?? 0);

      const row: AccuracyRow = {
        ts,
        tp: Number.isFinite(tp) ? tp : 0,
        fp: Number.isFinite(fp) ? fp : 0,
        fn: Number.isFinite(fn) ? fn : 0,
      };

      if (typeof (data as Record<string, unknown>)?.roundId === "string") {
        row.roundId = String((data as Record<string, unknown>)?.roundId);
      }
      if (typeof (data as Record<string, unknown>)?.hole === "number") {
        row.hole = Number((data as Record<string, unknown>)?.hole);
      }
      if (typeof (data as Record<string, unknown>)?.club === "string") {
        row.club = String((data as Record<string, unknown>)?.club);
      }
      if (typeof (data as Record<string, unknown>)?.distance_m === "number") {
        row.distance_m = Number((data as Record<string, unknown>)?.distance_m);
      }

      const extras: Record<string, unknown> = {};
      if (data && typeof data === "object") {
        for (const [key, value] of Object.entries(data)) {
          if (key === "tp" || key === "fp" || key === "fn" || key === "fnn") continue;
          if (key === "ts" || key === "timestampMs") continue;
          if (key in row) continue;
          extras[key] = value;
        }
      }

      Object.assign(row, extras);
      out.push(row);
    } catch {
      // ignore malformed lines
    }
  }

  return out;
}

function addTriplet(acc: Triplet, row: Triplet): Triplet {
  return {
    tp: acc.tp + row.tp,
    fp: acc.fp + row.fp,
    fn: acc.fn + row.fn,
  };
}

function toMetrics(triplet: Triplet): TripletWithMetrics {
  const precisionDen = triplet.tp + triplet.fp;
  const recallDen = triplet.tp + triplet.fn;
  const precision = precisionDen ? triplet.tp / precisionDen : 0;
  const recall = recallDen ? triplet.tp / recallDen : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    ...triplet,
    precision,
    recall,
    f1,
  };
}

function ensureTriplet(value?: Triplet): Triplet {
  if (!value) return { tp: 0, fp: 0, fn: 0 };
  return value;
}

export function binDistance(m?: number): BinKey {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return "unknown";
  if (m < 30) return "0–30m";
  if (m < 80) return "30–80m";
  if (m < 140) return "80–140m";
  if (m < 200) return "140–200m";
  return "200m+";
}

export function aggregate(rows: ReadonlyArray<AccuracyRow>): Aggregates {
  const totalsTriplet = rows.reduce<Triplet>((acc, row) => addTriplet(acc, row), {
    tp: 0,
    fp: 0,
    fn: 0,
  });

  const byHoleTriplets: Record<string, Triplet> = {};
  const byClubTriplets: Record<string, Triplet> = {};
  const byDistanceTriplets: Record<string, Triplet> = {};
  const byDateTriplets: Record<string, Triplet> = {};

  for (const row of rows) {
    const holeValue = typeof row.hole === "number" && Number.isFinite(row.hole) ? row.hole : undefined;
    const holeKey = holeValue !== undefined ? String(holeValue) : "-1";
    byHoleTriplets[holeKey] = addTriplet(ensureTriplet(byHoleTriplets[holeKey]), row);

    const clubValue = typeof row.club === "string" ? row.club.trim() : "";
    const clubKey = clubValue ? clubValue : "unknown";
    byClubTriplets[clubKey] = addTriplet(ensureTriplet(byClubTriplets[clubKey]), row);

    const distKey = binDistance(row.distance_m);
    byDistanceTriplets[distKey] = addTriplet(ensureTriplet(byDistanceTriplets[distKey]), row);

    const date = new Date(row.ts);
    const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate(),
    ).padStart(2, "0")}`;
    byDateTriplets[dateKey] = addTriplet(ensureTriplet(byDateTriplets[dateKey]), row);
  }

  const byHole: Aggregates["byHole"] = {};
  for (const [key, value] of Object.entries(byHoleTriplets)) {
    byHole[Number(key)] = toMetrics(value);
  }

  const byClub: Aggregates["byClub"] = {};
  for (const [key, value] of Object.entries(byClubTriplets)) {
    byClub[key] = toMetrics(value);
  }

  const byDistance: Aggregates["byDistance"] = {};
  for (const [key, value] of Object.entries(byDistanceTriplets)) {
    byDistance[key] = toMetrics(value);
  }

  return {
    totals: toMetrics(totalsTriplet),
    byHole,
    byClub,
    byDistance,
    byDate: byDateTriplets,
  };
}
