import { describe, expect, it } from 'vitest';

import { computeHoleCaddieTargets, type CourseLayout } from '../autoHoleCore';

const layout: CourseLayout = {
  id: 'demo',
  name: 'Demo Course',
  holes: [],
};

describe('computeHoleCaddieTargets', () => {
  it('returns green center and layup clamped to safe distance', () => {
    const hole = {
      number: 1,
      par: 4,
      yardage_m: 400,
      tee: { lat: 59.3, lon: 18.1 },
      green: { lat: 59.304, lon: 18.104 },
    };

    const result = computeHoleCaddieTargets(layout, hole);

    expect(result.green.position).toEqual(hole.green);
    expect(result.green.description).toBe('Center of green');
    expect(result.layup?.carryDistanceM).toBe(220);
    expect(result.layup?.position.lat).toBeCloseTo(59.3022, 4);
    expect(result.layup?.position.lon).toBeCloseTo(18.1022, 4);
  });

  it('omits layup when yardage is unavailable', () => {
    const hole = {
      number: 2,
      par: 3,
      yardage_m: null,
      tee: { lat: 59.31, lon: 18.11 },
      green: { lat: 59.312, lon: 18.112 },
    };

    const result = computeHoleCaddieTargets(layout, hole);

    expect(result.layup).toBeNull();
    expect(result.green.position).toEqual(hole.green);
  });
});
