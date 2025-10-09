export type PlaysLikeQuality = "good" | "warn" | "low";

export interface PlaysLikeComponents {
  slopeM: number;
  windM: number;
}

export interface PlaysLikeResult {
  distanceEff: number;
  components: PlaysLikeComponents;
  quality: PlaysLikeQuality;
}

import literatureProfile from "../../tools/playslike/literature_v1.json";

export interface PlaysLikeOptions {
  kS?: number;
  kHW?: number;
  warnThresholdRatio?: number;
  lowThresholdRatio?: number;
  config?: Partial<PlaysLikeCfg>;
  clubClass?: string | null;
  playerType?: string | null;
}

interface CacheValueWithTtl {
  ttlSeconds: number;
}

type CacheEntry<T extends CacheValueWithTtl> = {
  value: T;
  etag?: string;
  expiresAt: number;
};

export interface ElevationProviderData extends CacheValueWithTtl {
  elevationM: number;
  etag?: string;
}

export interface WindProviderData extends CacheValueWithTtl {
  speedMps: number;
  dirFromDeg: number;
  wParallel: number | null;
  wPerp: number | null;
  etag?: string;
}

const elevationCache = new Map<string, CacheEntry<ElevationProviderData>>();
const windCache = new Map<string, CacheEntry<WindProviderData>>();

const STUB_ELEVATION: ElevationProviderData = {
  elevationM: 0,
  ttlSeconds: 0,
};

const STUB_WIND: WindProviderData = {
  speedMps: 0,
  dirFromDeg: 0,
  wParallel: 0,
  wPerp: 0,
  ttlSeconds: 0,
};

let providersBaseUrl: string | null = null;

const toKey = (lat: number, lon: number) =>
  `${lat.toFixed(5)},${lon.toFixed(5)}`;

const nowMs = () => Date.now();

const normalizeBaseUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.replace(/\/+$/, "");
};

const parseMaxAge = (header: string | null | undefined): number | undefined => {
  if (!header) return undefined;
  for (const token of header.split(",")) {
    const trimmed = token.trim().toLowerCase();
    if (trimmed.startsWith("max-age=")) {
      const value = Number.parseInt(trimmed.substring(8), 10);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
  }
  return undefined;
};

const stripWeakEtag = (etag: string | null | undefined): string | undefined => {
  if (!etag) return undefined;
  const trimmed = etag.trim();
  if (!trimmed) return undefined;
  const withoutWeak = trimmed.startsWith("W/") ? trimmed.substring(2).trim() : trimmed;
  return withoutWeak.replace(/^"|"$/g, "");
};

const updateEntryExpiry = <T extends CacheValueWithTtl>(
  entry: CacheEntry<T>,
  ttlSeconds: number | undefined,
) => {
  const ttl = Number.isFinite(ttlSeconds) ? Math.max(0, Math.floor(ttlSeconds ?? 0)) : 0;
  entry.value = { ...entry.value, ttlSeconds: ttl };
  entry.expiresAt = nowMs() + ttl * 1000;
  return ttl;
};

const buildUrl = (
  base: string,
  path: string,
  params: Record<string, string | number | null | undefined>,
) => {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string | number] => {
      const value = entry[1];
      return value !== undefined && value !== null;
    })
    .map(([key, value]) => {
      const stringValue =
        typeof value === "number" ? value.toString() : String(value);
      return `${encodeURIComponent(key)}=${encodeURIComponent(stringValue)}`;
    })
    .join("&");
  return `${base}${path}${query ? `?${query}` : ""}`;
};

const refreshFrom304 = <T extends CacheValueWithTtl>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  entry: CacheEntry<T>,
  headers: Headers,
) => {
  const headerEtag = stripWeakEtag(headers.get("etag"));
  if (headerEtag) {
    entry.etag = headerEtag;
  }
  const ttl = parseMaxAge(headers.get("cache-control"));
  updateEntryExpiry(entry, ttl ?? entry.value.ttlSeconds);
  cache.set(key, entry);
  return { ...entry.value, etag: entry.etag };
};

export const setProvidersBaseUrl = (url: string | null) => {
  providersBaseUrl = normalizeBaseUrl(url);
};

export const getProvidersBaseUrl = () => providersBaseUrl;

const ensureBaseUrl = () => providersBaseUrl;

export const fetchElevation = async (
  lat: number,
  lon: number,
): Promise<ElevationProviderData> => {
  const base = ensureBaseUrl();
  if (!base) {
    return { ...STUB_ELEVATION };
  }
  const key = toKey(lat, lon);
  const cached = elevationCache.get(key);
  if (cached && cached.expiresAt > nowMs()) {
    return { ...cached.value, etag: cached.etag };
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const url = buildUrl(base, "/providers/elevation", { lat, lon });
  const response = await fetch(url, { headers });

  if (response.status === 304) {
    if (cached) {
      return refreshFrom304(elevationCache, key, cached, response.headers);
    }
    throw new Error("Received 304 without cached elevation entry");
  }

  if (!response.ok) {
    throw new Error(`Elevation provider error: ${response.status}`);
  }

  const payload = await response.json();
  const ttlCandidate =
    typeof payload.ttl_s === "number" ? payload.ttl_s : parseMaxAge(response.headers.get("cache-control"));
  const ttl = Math.max(0, Math.floor(ttlCandidate ?? 0));
  const entry: CacheEntry<ElevationProviderData> = {
    value: {
      elevationM: Number(payload.elevation_m ?? 0),
      ttlSeconds: ttl,
    },
    etag: payload.etag ?? stripWeakEtag(response.headers.get("etag")),
    expiresAt: nowMs() + ttl * 1000,
  };
  elevationCache.set(key, entry);
  return { ...entry.value, etag: entry.etag };
};

export const fetchWind = async (
  lat: number,
  lon: number,
  bearing?: number,
): Promise<WindProviderData> => {
  const base = ensureBaseUrl();
  if (!base) {
    return { ...STUB_WIND };
  }
  const key = `${toKey(lat, lon)}${bearing === undefined ? "" : `@${bearing.toFixed(2)}`}`;
  const cached = windCache.get(key);
  if (cached && cached.expiresAt > nowMs()) {
    return { ...cached.value, etag: cached.etag };
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const url = buildUrl(base, "/providers/wind", {
    lat,
    lon,
    bearing: bearing === undefined ? undefined : bearing,
  });
  const response = await fetch(url, { headers });

  if (response.status === 304) {
    if (cached) {
      return refreshFrom304(windCache, key, cached, response.headers);
    }
    throw new Error("Received 304 without cached wind entry");
  }

  if (!response.ok) {
    throw new Error(`Wind provider error: ${response.status}`);
  }

  const payload = await response.json();
  const ttlCandidate =
    typeof payload.ttl_s === "number" ? payload.ttl_s : parseMaxAge(response.headers.get("cache-control"));
  const ttl = Math.max(0, Math.floor(ttlCandidate ?? 0));
  const value: WindProviderData = {
    speedMps: Number(payload.speed_mps ?? 0),
    dirFromDeg: Number(payload.dir_from_deg ?? 0),
    wParallel:
      payload.w_parallel === null || payload.w_parallel === undefined
        ? null
        : Number(payload.w_parallel),
    wPerp:
      payload.w_perp === null || payload.w_perp === undefined ? null : Number(payload.w_perp),
    ttlSeconds: ttl,
  };
  const entry: CacheEntry<WindProviderData> = {
    value,
    etag: payload.etag ?? stripWeakEtag(response.headers.get("etag")),
    expiresAt: nowMs() + ttl * 1000,
  };
  windCache.set(key, entry);
  return { ...value, etag: entry.etag };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const MPS_TO_MPH = 2.237;
const MPH_TO_MPS = 1 / MPS_TO_MPH;

export const mpsToMph = (value: number) => value * MPS_TO_MPH;
export const mphToMps = (value: number) => value * MPH_TO_MPS;

type LiteratureProfile = typeof literatureProfile;

type PlaysLikeScale = {
  scaleHead?: number;
  scaleTail?: number;
};

type PlaysLikeScaleMap = Record<string, PlaysLikeScale | undefined> | null | undefined;

export interface PlaysLikeCfg {
  windModel: "percent_v1";
  alphaHead_per_mph: number;
  alphaTail_per_mph: number;
  slopeFactor: number;
  windCap_pctOfD: number;
  taperStart_mph: number;
  sidewindDistanceAdjust: boolean;
  playsLikeProfile?: string;
  byClub?: PlaysLikeScaleMap;
  byPlayerType?: PlaysLikeScaleMap;
}

export const DEFAULT_PLAYSLIKE_CFG: PlaysLikeCfg = {
  windModel: "percent_v1",
  alphaHead_per_mph: 0.01,
  alphaTail_per_mph: 0.005,
  slopeFactor: 1.0,
  windCap_pctOfD: 0.2,
  taperStart_mph: 20,
  sidewindDistanceAdjust: false,
  playsLikeProfile: "literature_v1",
  byClub: (literatureProfile as LiteratureProfile).byClub,
  byPlayerType: (literatureProfile as LiteratureProfile).byPlayerType,
};

const roundTo = (value: number, decimals: number) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(value * factor) / factor;
};

const sanitizeDistance = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : 0;

const resolveCfg = (cfg?: Partial<PlaysLikeCfg>): PlaysLikeCfg => {
  const merged: PlaysLikeCfg = { ...DEFAULT_PLAYSLIKE_CFG };
  if (!cfg) {
    return merged;
  }
  for (const [key, value] of Object.entries(cfg) as [keyof PlaysLikeCfg, unknown][]) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
};

type WindAlphas = Pick<PlaysLikeCfg, "alphaHead_per_mph" | "alphaTail_per_mph">;

const pickScale = (
  source: PlaysLikeScale | undefined,
): { head: number; tail: number } => ({
  head: source?.scaleHead ?? 1,
  tail: source?.scaleTail ?? 1,
});

export const applyLiteratureScaling = (
  clubClass: string | null | undefined,
  playerType: string | null | undefined,
  baseAlphas: WindAlphas,
  overrides?: { byClub?: PlaysLikeScaleMap; byPlayerType?: PlaysLikeScaleMap },
): WindAlphas => {
  const defaults: LiteratureProfile = literatureProfile;
  const clubMap = overrides?.byClub ?? defaults.byClub;
  const playerMap = overrides?.byPlayerType ?? defaults.byPlayerType;

  let scaleHead = 1;
  let scaleTail = 1;

  if (clubClass) {
    const scale = pickScale(clubMap?.[clubClass]);
    scaleHead *= scale.head;
    scaleTail *= scale.tail;
  }

  if (playerType) {
    const scale = pickScale(playerMap?.[playerType]);
    scaleHead *= scale.head;
    scaleTail *= scale.tail;
  }

  return {
    alphaHead_per_mph: baseAlphas.alphaHead_per_mph * scaleHead,
    alphaTail_per_mph: baseAlphas.alphaTail_per_mph * scaleTail,
  };
};

interface ComputePlaysLikeOptions {
  cfg?: Partial<PlaysLikeCfg>;
  clubClass?: string | null;
  playerType?: string | null;
}

export const computeSlopeAdjust = (
  D: number,
  deltaH: number,
  slopeFactor = DEFAULT_PLAYSLIKE_CFG.slopeFactor,
): number => {
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(deltaH)) return 0;
  const gain = clamp(slopeFactor, 0.2, 3.0);
  return deltaH * gain;
};

type PercentV1Options = Pick<
  PlaysLikeCfg,
  "alphaHead_per_mph" | "alphaTail_per_mph" | "windCap_pctOfD" | "taperStart_mph"
>;

export const computeWindAdjustPercentV1 = (
  D: number,
  wParallel_mps: number,
  opts?: Partial<PercentV1Options>,
): number => {
  const distance = sanitizeDistance(D);
  if (distance <= 0 || !Number.isFinite(wParallel_mps) || wParallel_mps === 0) {
    return 0;
  }
  const alphaHead = Math.max(
    opts?.alphaHead_per_mph ?? DEFAULT_PLAYSLIKE_CFG.alphaHead_per_mph,
    0,
  );
  const alphaTail = Math.max(
    opts?.alphaTail_per_mph ?? DEFAULT_PLAYSLIKE_CFG.alphaTail_per_mph,
    0,
  );
  const windCap = Math.max(
    opts?.windCap_pctOfD ?? DEFAULT_PLAYSLIKE_CFG.windCap_pctOfD,
    0,
  );
  const taperStart = Math.max(
    opts?.taperStart_mph ?? DEFAULT_PLAYSLIKE_CFG.taperStart_mph,
    0,
  );
  const windMph = Math.abs(wParallel_mps) * MPS_TO_MPH;
  if (windMph === 0) return 0;
  const isHeadwind = wParallel_mps >= 0;
  const alpha = isHeadwind ? alphaHead : alphaTail;
  const below = Math.min(windMph, taperStart) * alpha;
  const above = Math.max(windMph - taperStart, 0) * alpha * 0.8;
  let pct = below + above;
  if (!isHeadwind) {
    pct = -pct;
  }
  const cappedPct = clamp(pct, -windCap, windCap);
  return distance * cappedPct;
};

const computeQualityFromInputs = (
  distance: number,
  deltaH: number,
  wParallel_mps: number,
): PlaysLikeQuality => {
  if (distance <= 0) return "low";
  const hasSlope = Number.isFinite(deltaH);
  const hasWind = Number.isFinite(wParallel_mps);
  if (!hasSlope && !hasWind) return "low";
  const windMph = hasWind ? Math.abs(wParallel_mps) * MPS_TO_MPH : 0;
  if ((hasSlope && Math.abs(deltaH) > 15) || windMph > 12) {
    return "warn";
  }
  return "good";
};

const toComputeOptions = (
  value?: Partial<PlaysLikeCfg> | ComputePlaysLikeOptions,
): ComputePlaysLikeOptions => {
  if (!value) return {};
  if (
    typeof value === "object" &&
    ("cfg" in value || "clubClass" in value || "playerType" in value)
  ) {
    return value as ComputePlaysLikeOptions;
  }
  return { cfg: value as Partial<PlaysLikeCfg> };
};

export const computePlaysLike = (
  D: number,
  deltaH: number,
  wParallel_mps: number,
  options?: Partial<PlaysLikeCfg> | ComputePlaysLikeOptions,
): PlaysLikeResult => {
  const distance = sanitizeDistance(D);
  const { cfg, clubClass, playerType } = toComputeOptions(options);
  const resolved = resolveCfg(cfg);
  const slope = computeSlopeAdjust(distance, deltaH, resolved.slopeFactor);
  const baseAlphas: WindAlphas = {
    alphaHead_per_mph: resolved.alphaHead_per_mph,
    alphaTail_per_mph: resolved.alphaTail_per_mph,
  };
  const scaledAlphas =
    resolved.playsLikeProfile === "literature_v1"
      ? applyLiteratureScaling(clubClass, playerType, baseAlphas, {
          byClub: resolved.byClub,
          byPlayerType: resolved.byPlayerType,
        })
      : baseAlphas;
  const wind =
    resolved.windModel === "percent_v1"
      ? computeWindAdjustPercentV1(distance, wParallel_mps, {
          ...resolved,
          ...scaledAlphas,
        })
      : 0;
  const eff = distance + slope + wind;
  const quality = computeQualityFromInputs(distance, deltaH, wParallel_mps);
  return {
    distanceEff: roundTo(eff, 1),
    components: {
      slopeM: roundTo(slope, 1),
      windM: roundTo(wind, 1),
    },
    quality,
  };
};

export const computeWindAdjust = (D: number, wParallel: number, kHW = 2.5): number => {
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(wParallel)) return 0;
  const gain = clamp(kHW, 0.5, 6.0);
  return wParallel * gain;
};

export const compute = (
  D: number,
  deltaH: number,
  wParallel: number,
  opts: PlaysLikeOptions = {},
): PlaysLikeResult => {
  const overrides: Partial<PlaysLikeCfg> = { ...(opts.config ?? {}) };
  if (opts.kS !== undefined) {
    overrides.slopeFactor = opts.kS;
  }
  const result = computePlaysLike(D, deltaH, wParallel, {
    cfg: overrides,
    clubClass: opts.clubClass,
    playerType: opts.playerType,
  });
  const distance = sanitizeDistance(D);
  const total = Math.abs(result.components.slopeM) + Math.abs(result.components.windM);
  const ratio = distance > 0 ? total / distance : Number.POSITIVE_INFINITY;
  const warnThreshold = opts.warnThresholdRatio;
  const lowThreshold = opts.lowThresholdRatio;
  if (warnThreshold !== undefined || lowThreshold !== undefined) {
    const warn = warnThreshold ?? 0.05;
    const low = lowThreshold ?? 0.12;
    let quality: PlaysLikeQuality;
    if (!Number.isFinite(ratio)) {
      quality = "low";
    } else if (ratio <= warn) {
      quality = "good";
    } else if (ratio <= low) {
      quality = "warn";
    } else {
      quality = "low";
    }
    return {
      ...result,
      quality,
    };
  }
  return result;
};

export const mergePlaysLikeCfg = (cfg?: Partial<PlaysLikeCfg>): PlaysLikeCfg =>
  resolveCfg(cfg);
