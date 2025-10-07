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

export interface PlaysLikeOptions {
  kS?: number;
  kHW?: number;
  warnThresholdRatio?: number;
  lowThresholdRatio?: number;
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
  params: Record<string, string | number | undefined>,
) => {
  const query = Object.entries(params)
    .filter(([, value]): value is string | number => value !== undefined && value !== null)
    .map(([key, value]) => {
      let stringValue: string;
      if (typeof value === "number") {
        stringValue = value.toString();
      } else {
        stringValue = value;
      }
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

export const computeSlopeAdjust = (D: number, deltaH: number, kS = 1.0): number => {
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(deltaH)) return 0;
  const gain = clamp(kS, 0.2, 3.0);
  return deltaH * gain;
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
  opts: PlaysLikeOptions = {}
): PlaysLikeResult => {
  const options = {
    kS: clamp(opts.kS ?? 1.0, 0.2, 3.0),
    kHW: clamp(opts.kHW ?? 2.5, 0.5, 6.0),
    warnThresholdRatio: opts.warnThresholdRatio ?? 0.05,
    lowThresholdRatio: opts.lowThresholdRatio ?? 0.12,
  };
  const distance = Number.isFinite(D) ? Math.max(D, 0) : 0;
  const slopeM = computeSlopeAdjust(distance, deltaH, options.kS);
  const windM = computeWindAdjust(distance, wParallel, options.kHW);
  const eff = distance + slopeM + windM;
  const total = Math.abs(slopeM) + Math.abs(windM);
  const ratio = distance > 0 ? total / distance : Number.POSITIVE_INFINITY;
  let quality: PlaysLikeQuality;
  if (ratio <= options.warnThresholdRatio) {
    quality = "good";
  } else if (ratio <= options.lowThresholdRatio) {
    quality = "warn";
  } else {
    quality = "low";
  }
  return {
    distanceEff: eff,
    components: { slopeM, windM },
    quality,
  };
};
