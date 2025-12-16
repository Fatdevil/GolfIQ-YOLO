import { describe, expect, it } from 'vitest';

import { focusHintToDrills } from './focusHintToDrills';

describe('focusHintToDrills', () => {
  it('returns putting drills for 3-putt hints', () => {
    const drills = focusHintToDrills({ id: 'hint-1', text: 'Limit 3-putts and work on lag putting' });
    expect(drills[0]?.category).toBe('putting');
  });

  it('returns driving drills for fairway accuracy hints', () => {
    const drills = focusHintToDrills({ id: 'hint-2', text: 'Find more fairways with a reliable tee shot' });
    expect(drills[0]?.category).toBe('driving');
  });
});
