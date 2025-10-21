export type CourseIndexCourse = {
  courseId: string;
  name?: string | null;
  bbox: [number, number, number, number];
};

export type CourseIndex = {
  courses: CourseIndexCourse[];
};

export type CourseSearchResult = {
  id: string;
  name: string;
  dist_km: number | null;
  score: number;
};

type GeoPoint = { lat: number; lon: number };

const EARTH_RADIUS_KM = 6378.137;

function normaliseQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractTokens(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const charA = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function computeNameScore(
  course: CourseIndexCourse,
  normalisedQuery: string,
): number {
  if (!normalisedQuery) {
    return 1;
  }

  const candidates = new Set<string>();
  const name = course.name?.trim() ?? '';
  if (name) {
    const normalisedName = normaliseQuery(name);
    candidates.add(normalisedName);
    extractTokens(normalisedName).forEach((token) => candidates.add(token));
  }
  const normalisedId = normaliseQuery(course.courseId);
  candidates.add(normalisedId);

  let bestScore = 0;
  const queryLength = normalisedQuery.length;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.startsWith(normalisedQuery)) {
      return 1;
    }
    const slice = candidate.slice(0, Math.max(queryLength, 1));
    const distance = Math.min(
      levenshtein(normalisedQuery, slice),
      levenshtein(normalisedQuery, candidate),
    );
    const denom = Math.max(queryLength, 1);
    const score = Math.max(0, 1 - distance / denom);
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistance(here: GeoPoint, there: GeoPoint): number {
  const dLat = degToRad(there.lat - here.lat);
  const dLon = degToRad(there.lon - here.lon);
  const lat1 = degToRad(here.lat);
  const lat2 = degToRad(there.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function centroidFromBbox(
  bbox: [number, number, number, number],
): GeoPoint | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }
  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
}

function computeDistanceScore(
  bbox: [number, number, number, number],
  here?: GeoPoint,
): { distKm: number | null; distanceScore: number } {
  if (!here) {
    return { distKm: null, distanceScore: 0 };
  }
  const centroid = centroidFromBbox(bbox);
  if (!centroid) {
    return { distKm: null, distanceScore: 0 };
  }
  const distKm = haversineDistance(here, centroid);
  const distanceScore = 1 / (1 + distKm);
  return { distKm, distanceScore };
}

export function searchCourses(
  index: CourseIndex,
  query: string,
  here?: GeoPoint,
): CourseSearchResult[] {
  const normalisedQuery = normaliseQuery(query ?? '');
  const results: CourseSearchResult[] = [];

  for (const course of index.courses) {
    const nameScore = computeNameScore(course, normalisedQuery);
    if (normalisedQuery && nameScore <= 0) {
      continue;
    }
    const { distKm, distanceScore } = computeDistanceScore(course.bbox, here);
    const rawScore = here
      ? 0.6 * nameScore + 0.4 * distanceScore
      : nameScore;
    const score = Math.max(0, Math.min(1, rawScore));
    const name = course.name?.trim() || course.courseId;
    results.push({
      id: course.courseId,
      name,
      dist_km: distKm,
      score,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const distA = Number.isFinite(a.dist_km ?? NaN) ? (a.dist_km as number) : Number.POSITIVE_INFINITY;
    const distB = Number.isFinite(b.dist_km ?? NaN) ? (b.dist_km as number) : Number.POSITIVE_INFINITY;
    if (distA !== distB) {
      return distA - distB;
    }
    const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });

  return results.slice(0, 8);
}
