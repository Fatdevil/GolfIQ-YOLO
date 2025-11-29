import { apiFetch } from '@app/api/client';

export interface CourseHero {
  id: string;
  name: string;
  country?: string;
  tees: { id: string; name: string; slope?: number; rating?: number; lengthMeters?: number }[];
}

export interface CourseBundle {
  id: string;
  name: string;
  tees: { id: string; name: string; lengthMeters?: number }[];
  holes: {
    number: number;
    par: number;
    index?: number;
    lengthMeters?: number;
  }[];
}

export async function fetchHeroCourses(): Promise<CourseHero[]> {
  return apiFetch<CourseHero[]>('/api/courses/hero');
}

export async function fetchCourseBundle(courseId: string): Promise<CourseBundle> {
  return apiFetch<CourseBundle>(`/api/courses/${courseId}/bundle`);
}
