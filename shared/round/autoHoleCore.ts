export type LatLon = { lat: number; lon: number };

export type HoleLayout = {
  number: number;
  par: number;
  yardage_m?: number | null;
  tee: LatLon;
  green: LatLon;
};

export type CourseLayout = {
  id: string;
  name: string;
  holes: HoleLayout[];
  country?: string | null;
  city?: string | null;
  location?: LatLon | null;
};

export type CourseSummaryGeo = {
  id: string;
  name: string;
  location: LatLon | null;
};

export type AutoCourseSuggestion = {
  suggestedCourseId: string | null;
  distanceToSuggestedM: number | null;
  confidence: 'low' | 'medium' | 'high';
};

export type AutoHoleSuggestion = {
  suggestedHole: number | null;
  distanceToSuggestedM: number | null;
  confidence: 'low' | 'medium' | 'high';
};

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const hav =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(hav));
}

export function computeAutoHoleSuggestion(
  course: CourseLayout | null,
  playerPosition: LatLon | null,
): AutoHoleSuggestion {
  if (!course || !playerPosition) {
    return { suggestedHole: null, distanceToSuggestedM: null, confidence: 'low' };
  }

  let closest: { hole: number; distance: number } | null = null;

  for (const hole of course.holes) {
    const distance = distanceMeters(playerPosition, hole.tee);
    if (!closest || distance < closest.distance) {
      closest = { hole: hole.number, distance };
    }
  }

  if (!closest) {
    return { suggestedHole: null, distanceToSuggestedM: null, confidence: 'low' };
  }

  if (closest.distance > 200) {
    return { suggestedHole: null, distanceToSuggestedM: closest.distance, confidence: 'low' };
  }

  const confidence: AutoHoleSuggestion['confidence'] =
    closest.distance < 40 ? 'high' : closest.distance < 80 ? 'medium' : 'low';

  return {
    suggestedHole: closest.hole,
    distanceToSuggestedM: closest.distance,
    confidence,
  };
}

export function computeNearestCourse(
  courses: CourseSummaryGeo[],
  playerPosition: LatLon | null,
): AutoCourseSuggestion {
  if (!courses.length || !playerPosition) {
    return { suggestedCourseId: null, distanceToSuggestedM: null, confidence: 'low' };
  }

  const withLocation = courses.filter((course) => course.location);
  if (withLocation.length === 0) {
    return { suggestedCourseId: null, distanceToSuggestedM: null, confidence: 'low' };
  }

  let closest: { id: string; distance: number } | null = null;

  for (const course of withLocation) {
    const distance = distanceMeters(playerPosition, course.location!);
    if (!closest || distance < closest.distance) {
      closest = { id: course.id, distance };
    }
  }

  if (!closest) {
    return { suggestedCourseId: null, distanceToSuggestedM: null, confidence: 'low' };
  }

  if (closest.distance > 5_000) {
    return { suggestedCourseId: null, distanceToSuggestedM: closest.distance, confidence: 'low' };
  }

  const confidence: AutoCourseSuggestion['confidence'] =
    closest.distance < 200 ? 'high' : closest.distance < 1_000 ? 'medium' : 'low';

  return {
    suggestedCourseId: closest.id,
    distanceToSuggestedM: closest.distance,
    confidence,
  };
}
