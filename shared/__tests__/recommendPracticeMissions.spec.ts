import { describe, expect, it } from 'vitest';

import type { PracticeDecisionContext } from '../practice/practiceDecisionContext';
import { recommendPracticeMissions } from '../practice/recommendPracticeMissions';

describe('recommendPracticeMissions', () => {
  const baseContext: PracticeDecisionContext = {
    goalReached: false,
    practiceConfidence: 0.4,
    recentFocusAreas: ['driving'],
  };

  it('returns an empty array when context is missing', () => {
    expect(
      recommendPracticeMissions({
        context: null,
        missions: [
          { id: 'mission-1', focusArea: 'driving' },
          { id: 'mission-2', focusArea: 'approach' },
        ],
      }),
    ).toEqual([]);
  });

  it('prioritizes missions matching the primary focus area', () => {
    const recommendations = recommendPracticeMissions({
      context: { ...baseContext, goalReached: true },
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'approach' },
        { id: 'mission-3', focusArea: 'driving' },
      ],
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'focus_area' },
      { id: 'mission-3', rank: 2, reason: 'focus_area' },
    ]);
  });

  it('marks recommendations as goal_progress when the weekly goal is not reached', () => {
    const recommendations = recommendPracticeMissions({
      context: baseContext,
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'driving' },
        { id: 'mission-3', focusArea: 'driving' },
      ],
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'goal_progress' },
      { id: 'mission-2', rank: 2, reason: 'goal_progress' },
      { id: 'mission-3', rank: 3, reason: 'goal_progress' },
    ]);
  });

  it('respects maxResults', () => {
    const recommendations = recommendPracticeMissions({
      context: baseContext,
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'driving' },
        { id: 'mission-3', focusArea: 'driving' },
      ],
      maxResults: 2,
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'goal_progress' },
      { id: 'mission-2', rank: 2, reason: 'goal_progress' },
    ]);
  });

  it('falls back gracefully when no focus area matches', () => {
    const recommendations = recommendPracticeMissions({
      context: baseContext,
      missions: [
        { id: 'mission-1', focusArea: null },
        { id: 'mission-2', focusArea: 'other' },
        { id: 'mission-3', focusArea: undefined },
      ],
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'fallback' },
      { id: 'mission-2', rank: 2, reason: 'fallback' },
      { id: 'mission-3', rank: 3, reason: 'fallback' },
    ]);
  });
});
