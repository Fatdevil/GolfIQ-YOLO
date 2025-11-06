import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAutoHole,
  maybeAdvanceOnGreen,
  updateAutoHole,
  type AutoHoleState,
  type CourseRef,
} from '../../../../shared/arhud/auto_hole_detect';

function course(): CourseRef {
  return {
    id: 'demo',
    holes: [
      {
        hole: 1,
        tee: { lat: 0, lon: 0 },
        green: { mid: { lat: 0.0003, lon: 0 } },
      },
      {
        hole: 2,
        tee: { lat: 0.0006, lon: 0 },
        green: { mid: { lat: 0.0009, lon: 0 } },
      },
      {
        hole: 3,
        tee: { lat: 0.0012, lon: 0 },
        green: { mid: { lat: 0.0015, lon: 0 } },
      },
    ],
  };
}

function updateRepeated(state: AutoHoleState, fix: { lat: number; lon: number; heading_deg?: number }, times: number): AutoHoleState {
  let current = state;
  const courseData = course();
  let timestamp = Date.now();
  for (let i = 0; i < times; i += 1) {
    timestamp += 1000;
    current = updateAutoHole(current, { course: courseData, fix }, timestamp);
  }
  return current;
}

test('selects hole near tee or green', () => {
  const courseData = course();
  let state = createAutoHole(courseData, 1);

  state = updateRepeated(state, { lat: 0.0006, lon: 0 }, 3);
  assert.equal(state.hole, 2);
  assert.equal(state.previousHole, 1);

  state = updateRepeated(state, { lat: 0.0015, lon: 0 }, 3);
  assert.equal(state.hole, 3);
});

test('heading disambiguates close greens', () => {
  const courseData: CourseRef = {
    id: 'heading-demo',
    holes: [
      {
        hole: 1,
        tee: { lat: 0, lon: 0 },
        green: { mid: { lat: 0.0012, lon: 0.0008 } },
      },
      {
        hole: 2,
        tee: { lat: 0, lon: 0 },
        green: { mid: { lat: 0.0012, lon: -0.0008 } },
      },
    ],
  };
  let state = createAutoHole(courseData, 1);

  for (let i = 0; i < 3; i += 1) {
    state = updateAutoHole(state, { course: courseData, fix: { lat: 0, lon: 0, heading_deg: 90 } }, Date.now() + i * 1000);
  }
  assert.equal(state.hole, 1);

  for (let i = 0; i < 3; i += 1) {
    state = updateAutoHole(state, { course: courseData, fix: { lat: 0, lon: 0, heading_deg: 270 } }, Date.now() + 4000 + i * 1000);
  }
  assert.equal(state.hole, 2);
});

test('maybeAdvanceOnGreen jumps to next hole when tee leads', () => {
  const courseData = course();
  let state = createAutoHole(courseData, 1);

  // Arrive at green of hole 1
  for (let i = 0; i < 3; i += 1) {
    state = updateAutoHole(state, { course: courseData, fix: { lat: 0.0003, lon: 0 } }, Date.now() + i * 1000);
  }

  // Walk toward tee of hole 2 to accumulate tee lead votes
  for (let i = 0; i < 3; i += 1) {
    state = updateAutoHole(state, { course: courseData, fix: { lat: 0.0006, lon: 0 } }, Date.now() + 3000 + i * 1000);
  }

  state = maybeAdvanceOnGreen(state, true, Date.now() + 10_000);
  assert.equal(state.hole, 2);
  assert.equal(state.previousHole, 1);
});
