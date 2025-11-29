import { describe, expect, it, vi } from 'vitest';

import * as client from '@app/api/client';
import { fetchCourseBundle, fetchHeroCourses, type CourseBundle, type CourseHero } from '@app/api/courses';

vi.mock('@app/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('courses api', () => {
  it('fetchHeroCourses calls hero endpoint', async () => {
    const payload: CourseHero[] = [
      { id: 'c1', name: 'Augusta', country: 'US', tees: [] },
    ];
    vi.mocked(client.apiFetch).mockResolvedValue(payload as never);

    const result = await fetchHeroCourses();

    expect(client.apiFetch).toHaveBeenCalledWith('/api/courses/hero');
    expect(result).toEqual(payload);
  });

  it('fetchCourseBundle resolves bundle for course', async () => {
    const bundle: CourseBundle = {
      id: 'c1',
      name: 'Augusta',
      tees: [{ id: 't1', name: 'Black', lengthMeters: 6500 }],
      holes: [
        { number: 1, par: 4, index: 7, lengthMeters: 400 },
      ],
    };
    vi.mocked(client.apiFetch).mockResolvedValue(bundle as never);

    const result = await fetchCourseBundle('c1');

    expect(client.apiFetch).toHaveBeenCalledWith('/api/courses/c1/bundle');
    expect(result).toEqual(bundle);
  });
});
