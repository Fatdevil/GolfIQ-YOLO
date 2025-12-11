import { describe, expect, it } from 'vitest';

import type { PracticeDecisionContext } from '../practice/practiceDecisionContext';
import { recommendPracticeMissions } from '../practice/recommendPracticeMissions';

describe('recommendPracticeMissions', () => {
  const baseContext: PracticeDecisionContext = {
    goalReached: false,
    goalTarget: 3,
    goalProgress: 1,
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
      { id: 'mission-1', rank: 1, reason: 'focus_area', algorithmVersion: 'v1', focusArea: 'driving' },
      { id: 'mission-3', rank: 2, reason: 'focus_area', algorithmVersion: 'v1', focusArea: 'driving' },
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
      {
        id: 'mission-1',
        rank: 1,
        reason: 'goal_progress',
        algorithmVersion: 'v1',
        focusArea: 'driving',
      },
      {
        id: 'mission-2',
        rank: 2,
        reason: 'goal_progress',
        algorithmVersion: 'v1',
        focusArea: 'driving',
      },
      {
        id: 'mission-3',
        rank: 3,
        reason: 'goal_progress',
        algorithmVersion: 'v1',
        focusArea: 'driving',
      },
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
      { id: 'mission-1', rank: 1, reason: 'goal_progress', algorithmVersion: 'v1', focusArea: 'driving' },
      { id: 'mission-2', rank: 2, reason: 'goal_progress', algorithmVersion: 'v1', focusArea: 'driving' },
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
      { id: 'mission-1', rank: 1, reason: 'fallback', algorithmVersion: 'v1', focusArea: null },
      { id: 'mission-2', rank: 2, reason: 'fallback', algorithmVersion: 'v1', focusArea: null },
      { id: 'mission-3', rank: 3, reason: 'fallback', algorithmVersion: 'v1', focusArea: null },
    ]);
  });

  it('uses v2 ranking for treatment experiment users', () => {
    const recommendations = recommendPracticeMissions({
      context: {
        ...baseContext,
        goalReached: false,
        goalTarget: 4,
        goalProgress: 1,
        practiceConfidence: 0.3,
        recentFocusAreas: ['approach', 'putting'],
      },
      missions: [
        {
          id: 'mission-1',
          focusArea: 'putting',
          priorityScore: 18,
          estimatedMinutes: 25,
          difficulty: 1,
        },
        {
          id: 'mission-2',
          focusArea: 'approach',
          priorityScore: 12,
          estimatedMinutes: 12,
          difficulty: 2,
          completionCount: 1,
        },
        { id: 'mission-3', focusArea: 'driving', priorityScore: 30 },
      ],
      experimentVariant: 'treatment',
    });

    expect(recommendations).toEqual([
      {
        id: 'mission-2',
        rank: 1,
        reason: 'goal_progress',
        algorithmVersion: 'v2',
        focusArea: 'approach',
      },
      {
        id: 'mission-1',
        rank: 2,
        reason: 'goal_progress',
        algorithmVersion: 'v2',
        focusArea: 'putting',
      },
      {
        id: 'mission-3',
        rank: 3,
        reason: 'fallback',
        algorithmVersion: 'v2',
        focusArea: 'driving',
      },
    ]);
  });

  it('falls back to v1-like behavior when focus signals are missing in v2', () => {
    const recommendations = recommendPracticeMissions({
      context: { ...baseContext, recentFocusAreas: [] },
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'approach' },
        { id: 'mission-3', focusArea: 'driving' },
      ],
      experimentVariant: 'treatment',
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'fallback', algorithmVersion: 'v1', focusArea: 'driving' },
      { id: 'mission-2', rank: 2, reason: 'fallback', algorithmVersion: 'v1', focusArea: 'approach' },
      { id: 'mission-3', rank: 3, reason: 'fallback', algorithmVersion: 'v1', focusArea: 'driving' },
    ]);
  });

  it('uses v1 when the experiment is disabled', () => {
    const recommendations = recommendPracticeMissions({
      context: baseContext,
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'approach' },
      ],
      experimentVariant: 'disabled',
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'goal_progress', algorithmVersion: 'v1', focusArea: 'driving' },
    ]);
  });

  it('uses v1 ranking for control experiment users', () => {
    const recommendations = recommendPracticeMissions({
      context: baseContext,
      missions: [
        { id: 'mission-1', focusArea: 'driving' },
        { id: 'mission-2', focusArea: 'approach' },
      ],
      experimentVariant: 'control',
    });

    expect(recommendations).toEqual([
      { id: 'mission-1', rank: 1, reason: 'goal_progress', algorithmVersion: 'v1', focusArea: 'driving' },
    ]);
  });
});
