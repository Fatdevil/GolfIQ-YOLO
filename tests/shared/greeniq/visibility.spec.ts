import { describe, it, expect } from 'vitest';
import { puttFeedbackVisible, puttOverrideEnabled } from '../../../shared/greeniq/visibility';

describe('putt visibility gating', () => {
  it('tournament-safe: only visible after hole; switch disabled', () => {
    expect(puttOverrideEnabled(true)).toBe(false);
    expect(
      puttFeedbackVisible({ tournamentSafe: true, holeComplete: false, override: false }),
    ).toBe(false);
    expect(
      puttFeedbackVisible({ tournamentSafe: true, holeComplete: false, override: true }),
    ).toBe(false);
    expect(
      puttFeedbackVisible({ tournamentSafe: true, holeComplete: true, override: false }),
    ).toBe(true);
  });

  it('non-tournament: default hidden; override shows before hole; always visible after hole', () => {
    expect(puttOverrideEnabled(false)).toBe(true);
    expect(
      puttFeedbackVisible({ tournamentSafe: false, holeComplete: false, override: false }),
    ).toBe(false);
    expect(
      puttFeedbackVisible({ tournamentSafe: false, holeComplete: false, override: true }),
    ).toBe(true);
    expect(
      puttFeedbackVisible({ tournamentSafe: false, holeComplete: true, override: false }),
    ).toBe(true);
  });
});
