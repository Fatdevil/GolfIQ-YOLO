import { describe, it, expect } from 'vitest';
import { buildGhostTelemetryKey } from './ghostTelemetry';

describe('buildGhostTelemetryKey', () => {
  it('formats with fixed decimals and nulls', () => {
    const key = buildGhostTelemetryKey({
      shotId: 7,
      range: 153.14,         // one decimal
      lateral: -2.345,       // two decimals
      longErr: -3.999,       // two decimals
      latErr: null           // "null"
    });
    expect(key).toBe('7|153.1|-2.35|-4.00|null');
  });

  it('is stable for same inputs', () => {
    const a = buildGhostTelemetryKey({ shotId: 1, range: 150, lateral: 0, longErr: 0, latErr: 0 });
    const b = buildGhostTelemetryKey({ shotId: 1, range: 150, lateral: 0, longErr: 0, latErr: 0 });
    expect(a).toBe(b);
  });

  it('changes when shotId changes even if metrics are identical', () => {
    const a = buildGhostTelemetryKey({ shotId: 10, range: 150, lateral: 1.23, longErr: 0, latErr: 0 });
    const b = buildGhostTelemetryKey({ shotId: 11, range: 150, lateral: 1.23, longErr: 0, latErr: 0 });
    expect(a).not.toBe(b);
  });
});
