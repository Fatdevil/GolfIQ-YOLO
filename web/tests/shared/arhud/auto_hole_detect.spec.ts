import { describe, expect, it } from 'vitest';

import {
  createAutoHole,
  maybeAdvanceOnGreen,
  updateAutoHole,
  type CourseRef,
} from '@shared/arhud/auto_hole_detect';

const COURSE: CourseRef = {
  id: 'demo-course',
  holes: [
    {
      hole: 1,
      tee: { lat: 37.0001, lon: -122.0001 },
      green: { mid: { lat: 37.0004, lon: -122.0001 } },
    },
    {
      hole: 2,
      tee: { lat: 37.00045, lon: -122.00005 },
      green: { mid: { lat: 37.0008, lon: -122.00005 } },
    },
  ],
};

function fixAt(lat: number, lon: number, heading_deg?: number) {
  return { lat, lon, heading_deg };
}

describe('auto hole detect heuristics', () => {
  it('locks onto the current hole near tee and green', () => {
    let state = createAutoHole(COURSE, 1);

    state = updateAutoHole(state, { course: COURSE, fix: fixAt(37.0001, -122.0001) });
    expect(state.hole).toBe(1);

    state = updateAutoHole(state, { course: COURSE, fix: fixAt(37.0004, -122.0001) });
    expect(state.hole).toBe(1);
    expect(state.onGreen).toBe(true);

    const tee2 = fixAt(37.00045, -122.00005);
    state = updateAutoHole(state, { course: COURSE, fix: tee2 });
    expect(state.hole).toBe(1);

    state = updateAutoHole(state, { course: COURSE, fix: tee2 });
    expect(state.hole).toBe(2);
    expect(state.previousHole).toBe(1);
  });

  it('uses heading to disambiguate similar greens', () => {
    const headingCourse: CourseRef = {
      id: 'heading',
      holes: [
        {
          hole: 1,
          tee: { lat: 37.0, lon: -122.0 },
          green: { mid: { lat: 37.0005, lon: -122.0 } },
        },
        {
          hole: 2,
          tee: { lat: 37.0, lon: -122.0005 },
          green: { mid: { lat: 37.0005, lon: -122.0005 } },
        },
      ],
    };

    let state = createAutoHole(headingCourse, 1);
    const farFix = fixAt(36.999, -122.00025, 0);
    state = updateAutoHole(state, { course: headingCourse, fix: farFix });
    expect(state.hole).toBe(1);
    expect(state.reasons).toContain('heading');
  });

  it('requires consecutive votes before switching holes', () => {
    let state = createAutoHole(COURSE, 1);
    const tee2 = fixAt(37.00045, -122.00005);

    state = updateAutoHole(state, { course: COURSE, fix: tee2 });
    expect(state.hole).toBe(1);

    state = updateAutoHole(state, { course: COURSE, fix: fixAt(37.0002, -122.0001) });
    expect(state.hole).toBe(1);
  });

  it('advances automatically when on green and next tee is closest', () => {
    let state = createAutoHole(COURSE, 1);
    const onGreenFix = fixAt(37.0004, -122.0001);

    state = updateAutoHole(state, { course: COURSE, fix: onGreenFix });
    state = updateAutoHole(state, { course: COURSE, fix: onGreenFix });
    state = updateAutoHole(state, { course: COURSE, fix: onGreenFix });

    expect(state.onGreen).toBe(true);
    expect(state.nextTeeVotes).toBeGreaterThanOrEqual(1);

    state = maybeAdvanceOnGreen(state, true, Date.now() + 1000);
    expect(state.hole).toBe(2);
    expect(state.previousHole).toBe(1);

    const reset = maybeAdvanceOnGreen(state, false);
    expect(reset.onGreen).toBe(false);
    expect(reset.nextTeeVotes).toBe(0);
  });
});
