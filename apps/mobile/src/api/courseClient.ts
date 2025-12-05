import { apiFetch } from './client';

export type CourseSummary = {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  holeCount: number;
};

export async function fetchCourses(): Promise<CourseSummary[]> {
  return apiFetch<CourseSummary[]>('/courses');
}
