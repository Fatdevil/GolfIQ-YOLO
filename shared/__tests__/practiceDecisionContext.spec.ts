import { describe, expect, it } from 'vitest';

import { buildPracticeDecisionContext } from '../practice/practiceDecisionContext';

describe('buildPracticeDecisionContext', () => {
  it('returns null when no inputs are provided', () => {
    expect(buildPracticeDecisionContext({})).toBeNull();
  });

  it('maps focus areas and derives confidence from goal progress', () => {
    const ctx = buildPracticeDecisionContext({
      summary: {
        sessionsCompleted: 4,
        shotsCompleted: 120,
        goalTarget: 6,
        goalProgress: 3,
        goalReached: false,
        windowDays: 7,
      },
      focusAreas: ['Approach', 'putts', 'APPROACH'],
    });

    expect(ctx).toEqual({
      goalReached: false,
      recentFocusAreas: ['approach', 'putting'],
      practiceConfidence: 0.5,
    });
  });

  it('uses session count as a fallback when no goal exists', () => {
    const ctx = buildPracticeDecisionContext({
      summary: {
        sessionsCompleted: 2,
        shotsCompleted: 80,
        goalTarget: null,
        goalProgress: 0,
        goalReached: false,
        windowDays: 7,
      },
      focusAreas: ['driving'],
    });

    expect(ctx).toEqual({
      goalReached: false,
      recentFocusAreas: ['driving'],
      practiceConfidence: 2 / 3,
    });
  });

  it('clamps and sanitizes confidence', () => {
    const ctx = buildPracticeDecisionContext({
      summary: {
        sessionsCompleted: 12,
        shotsCompleted: 500,
        goalTarget: 4,
        goalProgress: 10,
        goalReached: true,
        windowDays: 7,
      },
      focusAreas: ['unknown'],
    });

    expect(ctx).toEqual({
      goalReached: true,
      recentFocusAreas: [],
      practiceConfidence: 1,
    });
  });
});
