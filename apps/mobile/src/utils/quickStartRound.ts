import {
  computeAutoHoleSuggestion,
  computeNearestCourse,
  type CourseLayout,
  type LatLon,
} from '@shared/round/autoHoleCore';
import type { CourseSummary } from '@app/api/courseClient';

export type QuickStartContext = {
  courses: CourseSummary[];
  playerPosition: LatLon | null;
  courseLayoutsById: Record<string, CourseLayout>;
};

export type QuickStartPlan = {
  courseId: string;
  startHole: number;
  holeCount: number;
};

export function buildQuickStartPlan(context: QuickStartContext): QuickStartPlan | null {
  const { courses, playerPosition, courseLayoutsById } = context;

  if (!playerPosition || courses.length === 0) return null;

  const nearest = computeNearestCourse(
    courses.map((course) => ({
      id: course.id,
      name: course.name,
      location: course.location ?? null,
    })),
    playerPosition,
  );

  if (!nearest.suggestedCourseId) return null;

  const layout = courseLayoutsById[nearest.suggestedCourseId];
  if (!layout) return null;

  const holeSuggestion = computeAutoHoleSuggestion(layout, playerPosition);
  const startHole = holeSuggestion.suggestedHole ?? 1;
  const totalHoles = layout.holes.length;
  const desiredMax = Math.min(18, totalHoles);
  const remaining = Math.max(totalHoles - (startHole - 1), 0);
  const holeCount = Math.min(desiredMax, remaining);

  if (holeCount <= 0) return null;

  return {
    courseId: nearest.suggestedCourseId,
    startHole,
    holeCount,
  };
}
