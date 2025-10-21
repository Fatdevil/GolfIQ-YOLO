import assert from 'node:assert/strict';
import test from 'node:test';

import { searchCourses, type CourseIndex } from '../../../shared/arhud/course_search';

test('searchCourses prioritises prefix matches', () => {
  const index: CourseIndex = {
    courses: [
      { courseId: 'alpha_dunes', name: 'Alpha Dunes', bbox: [0, 0, 0, 0] },
      { courseId: 'bravo_valley', name: 'Bravo Valley', bbox: [1, 1, 1, 1] },
      { courseId: 'charlie_lake', name: 'Charlie Lake', bbox: [2, 2, 2, 2] },
    ],
  };

  const results = searchCourses(index, 'br');
  assert.ok(results.length >= 1);
  assert.equal(results[0]?.id, 'bravo_valley');
  assert.ok((results[0]?.score ?? 0) > 0.9);
});

test('searchCourses handles small typos with fuzzy scoring', () => {
  const index: CourseIndex = {
    courses: [
      { courseId: 'sunset_links', name: 'Sunset Links', bbox: [-1, -1, -1, -1] },
      { courseId: 'sunrise_bay', name: 'Sunrise Bay', bbox: [-2, -2, -2, -2] },
    ],
  };

  const results = searchCourses(index, 'sunet');
  assert.equal(results[0]?.id, 'sunset_links');
  assert.ok((results[0]?.score ?? 0) > 0.6);
});

test('searchCourses orders by proximity when query is empty', () => {
  const index: CourseIndex = {
    courses: [
      {
        courseId: 'near_course',
        name: 'Near Course',
        bbox: [-122.4205, 37.775, -122.4185, 37.7765],
      },
      {
        courseId: 'far_course',
        name: 'Far Course',
        bbox: [-122.1005, 38.0, -122.099, 38.0015],
      },
    ],
  };

  const here = { lat: 37.7749, lon: -122.4194 };
  const results = searchCourses(index, '', here);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.id, 'near_course');
  assert.ok((results[0]?.dist_km ?? 0) < (results[1]?.dist_km ?? Infinity));
});
