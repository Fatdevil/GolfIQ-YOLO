import { CLUB_SEQUENCE, defaultBag, type Bag, type ClubId } from "../playslike/bag";

export interface ClubStats {
  carry_m: number;
  sigma_long_m: number;
  sigma_lat_m: number;
}

export interface PlayerModel {
  clubs: Record<ClubId, ClubStats>;
  tuningActive: boolean;
}

type DispersionOverride = {
  sigma_long_m: number;
  sigma_lat_m: number;
};

type BuildArgs = {
  bag: Bag;
  dispersion?: Record<ClubId, DispersionOverride | undefined>;
};

const MIN_SIGMA_LONG = 6;
const MIN_SIGMA_LAT = 3;
const DEFAULT_LONG_FRACTION = 0.14;
const DEFAULT_LAT_FRACTION = 0.09;

const sanitizeDistance = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : fallback;
};

const sanitizeSigma = (value: number | undefined, minimum: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Number(value);
  if (numeric <= 0) {
    return minimum;
  }
  return Math.max(minimum, numeric);
};

export function buildPlayerModel(args: BuildArgs): PlayerModel {
  const baseBag = defaultBag();
  const clubs: Partial<Record<ClubId, ClubStats>> = {};
  let tuningActive = false;
  for (const club of CLUB_SEQUENCE) {
    const fallback = baseBag[club];
    const carry = sanitizeDistance(args.bag?.[club], fallback);
    if (carry !== fallback) {
      tuningActive = true;
    }
    const dispersion = args.dispersion?.[club];
    const sigmaLong = sanitizeSigma(
      dispersion?.sigma_long_m,
      MIN_SIGMA_LONG,
      Math.max(MIN_SIGMA_LONG, carry * DEFAULT_LONG_FRACTION),
    );
    const sigmaLat = sanitizeSigma(
      dispersion?.sigma_lat_m,
      MIN_SIGMA_LAT,
      Math.max(MIN_SIGMA_LAT, carry * DEFAULT_LAT_FRACTION),
    );
    if (dispersion && (dispersion.sigma_lat_m || dispersion.sigma_long_m)) {
      tuningActive = true;
    }
    clubs[club] = {
      carry_m: carry,
      sigma_long_m: sigmaLong,
      sigma_lat_m: sigmaLat,
    };
  }
  return {
    clubs: clubs as Record<ClubId, ClubStats>,
    tuningActive,
  };
}
