import { describe, expect, it } from 'vitest';

import { MIN_AUTOCALIBRATED_SAMPLES, type BagClubStatsMap } from '@shared/caddie/bagStats';
import { buildBagTuningSuggestions } from '@shared/caddie/bagTuningSuggestions';
import type { PlayerBag } from '@shared/caddie/playerBag';

const bag: PlayerBag = {
  clubs: [
    { clubId: '9i', label: '9i', avgCarryM: 120, sampleCount: 0, active: true },
    { clubId: '8i', label: '8i', avgCarryM: 135, sampleCount: 0, active: true },
    { clubId: '7i', label: '7i', avgCarryM: 150, sampleCount: 0, active: true },
    { clubId: '6i', label: '6i', avgCarryM: 200, sampleCount: 0, active: true },
    { clubId: '5i', label: '5i', avgCarryM: 204, sampleCount: 0, active: true },
    { clubId: 'gw', label: 'Gap wedge', avgCarryM: 100, sampleCount: 0, active: true },
  ],
};

const stats: BagClubStatsMap = {
  '9i': { clubId: '9i', meanDistanceM: 122, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
  '8i': { clubId: '8i', meanDistanceM: 138, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
  '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
  '6i': { clubId: '6i', meanDistanceM: 210, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
  '5i': { clubId: '5i', meanDistanceM: 212, sampleCount: MIN_AUTOCALIBRATED_SAMPLES },
};

describe('buildBagTuningSuggestions', () => {
  it('creates suggestions for gaps, overlaps, and calibration needs with severities', () => {
    const { suggestions } = buildBagTuningSuggestions(bag, stats);

    expect(suggestions).toEqual([
      {
        id: 'fill_gap:7i:6i',
        type: 'fill_gap',
        severity: 'high',
        lowerClubId: '7i',
        upperClubId: '6i',
        gapDistance: 60,
      },
      {
        id: 'reduce_overlap:6i:5i',
        type: 'reduce_overlap',
        severity: 'high',
        lowerClubId: '6i',
        upperClubId: '5i',
        gapDistance: 2,
      },
      {
        id: 'calibrate:gw',
        type: 'calibrate',
        severity: 'high',
        clubId: 'gw',
      },
    ]);
  });

  it('sorts by severity, type, and bag order', () => {
    const calibrationOnly: BagClubStatsMap = {
      '9i': { clubId: '9i', meanDistanceM: 120, sampleCount: 0 },
      '8i': { clubId: '8i', meanDistanceM: 125, sampleCount: 1 },
    };

    const { suggestions } = buildBagTuningSuggestions(bag, calibrationOnly);

    expect(suggestions.map((s) => s.id)).toEqual([
      'calibrate:9i',
      'calibrate:7i',
      'calibrate:6i',
      'calibrate:5i',
      'calibrate:gw',
      'calibrate:8i',
    ]);
  });
});
