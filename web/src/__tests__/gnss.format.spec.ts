import { describe, expect, it } from 'vitest';

import {
  formatAccuracyMeters,
  formatDop,
  formatDualFrequency,
  formatSatelliteCount,
  gnssAccuracyLevel,
} from '@shared/arhud/location';

describe('gnss format helpers', () => {
  it('classifies accuracy into levels', () => {
    expect(gnssAccuracyLevel(1.6)).toBe('good');
    expect(gnssAccuracyLevel(3.2)).toBe('ok');
    expect(gnssAccuracyLevel(6.4)).toBe('poor');
    expect(gnssAccuracyLevel(undefined)).toBe('unknown');
  });

  it('formats accuracy distance with sign and decimals', () => {
    expect(formatAccuracyMeters(1.61)).toBe('±1.6 m');
    expect(formatAccuracyMeters(12.2)).toBe('±12 m');
    expect(formatAccuracyMeters(null)).toBe('±— m');
  });

  it('formats satellite counts and DOP values', () => {
    expect(formatSatelliteCount(18.2)).toBe('sats: 18');
    expect(formatSatelliteCount(null)).toBe('sats: —');
    expect(formatDop(0.92)).toBe('DOP: 0.92');
    expect(formatDop(undefined)).toBe('DOP: —');
  });

  it('formats dual-frequency flag', () => {
    expect(formatDualFrequency(true)).toBe('L1/L5 ✓');
    expect(formatDualFrequency(false)).toBe('L1/L5 –');
  });
});
