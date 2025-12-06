import { apiFetch } from './client';
import type { CourseLayout } from '@shared/round/autoHoleCore';

export type CourseSummary = {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  holeCount: number;
  location?: { lat: number; lon: number } | null;
  totalPar?: number | null;
};

export async function fetchCourses(): Promise<CourseSummary[]> {
  return apiFetch<CourseSummary[]>('/course-layouts');
}

export async function fetchCourseLayout(courseId: string): Promise<CourseLayout> {
  return apiFetch<CourseLayout>(`/course-layouts/${courseId}`);
}
