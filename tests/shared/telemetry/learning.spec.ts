import { describe, expect, it, vi } from 'vitest';

import {
  emitLearningDrillDelta,
  emitLearningDrillEnd,
  emitLearningDrillStart,
  sanitizeNumber,
} from '../../../shared/telemetry/learning';

describe('sanitizeNumber', () => {
  it('handles nullish and blank values', () => {
    expect(sanitizeNumber(null)).toBeNull();
    expect(sanitizeNumber(undefined)).toBeNull();
    expect(sanitizeNumber('')).toBeNull();
    expect(sanitizeNumber('   ')).toBeNull();
  });

  it('coerces numeric-like values', () => {
    expect(sanitizeNumber('0')).toBe(0);
    expect(sanitizeNumber(0)).toBe(0);
    expect(sanitizeNumber('12.5')).toBe(12.5);
  });

  it('filters NaN', () => {
    expect(sanitizeNumber(Number.NaN)).toBeNull();
  });
});

describe('drill telemetry normalization', () => {
  it('preserves nullish numeric values', () => {
    const emitter = vi.fn();
    const payload = { key: 'test', today: undefined, ema: '', delta: null } as const;
    emitLearningDrillStart(emitter, payload as any);
    emitLearningDrillEnd(emitter, payload as any);
    emitLearningDrillDelta(emitter, payload as any);

    expect(emitter).toHaveBeenCalledTimes(3);
    emitter.mock.calls.forEach(([event, payload]) => {
      expect(event.startsWith('learning.drill.')).toBe(true);
      expect(payload.today).toBeNull();
      expect(payload.ema).toBeNull();
      expect(payload.delta).toBeNull();
    });
  });
});
