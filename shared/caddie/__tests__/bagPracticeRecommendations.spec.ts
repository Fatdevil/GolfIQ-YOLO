import { describe, expect, it } from 'vitest';

import type { BagReadinessOverview } from '../bagReadiness';
import {
  buildBagPracticeRecommendation,
  buildBagPracticeRecommendations,
  buildMissionCoverageByClub,
  getTopPracticeRecommendation,
  getTopPracticeRecommendationForRecap,
} from '../bagPracticeRecommendations';
import type { PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import type { BagSuggestion } from '../bagTuningSuggestions';

const baseOverview: BagReadinessOverview = {
  readiness: {
    score: 55,
    grade: 'okay',
    totalClubs: 2,
    calibratedClubs: 0,
    needsMoreSamplesCount: 0,
    noDataCount: 0,
    largeGapCount: 0,
    overlapCount: 0,
  },
  suggestions: [],
  dataStatusByClubId: {},
};

describe('buildBagPracticeRecommendation', () => {
  it('returns recommendation for large gap suggestions', () => {
    const suggestions: BagSuggestion[] = [
      {
        id: 'fill_gap:8i:9i',
        type: 'fill_gap',
        severity: 'high',
        lowerClubId: '8i',
        upperClubId: '9i',
        gapDistance: 25,
      },
    ];

    const rec = buildBagPracticeRecommendation(baseOverview, suggestions);

    expect(rec).toEqual({
      id: 'practice_fill_gap:8i:9i',
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
      targetClubs: ['8i', '9i'],
      targetSampleCount: 16,
      sourceSuggestionId: 'fill_gap:8i:9i',
      status: 'new',
      priorityScore: 0,
      lastCompletedAt: null,
    });
  });

  it('returns recommendation for calibrate suggestions with low samples', () => {
    const suggestions: BagSuggestion[] = [
      {
        id: 'calibrate:pw',
        type: 'calibrate',
        severity: 'medium',
        clubId: 'pw',
      },
    ];

    const rec = buildBagPracticeRecommendation(baseOverview, suggestions);

    expect(rec).toEqual({
      id: 'practice_calibrate:pw',
      titleKey: 'bag.practice.calibrate.title',
      descriptionKey: 'bag.practice.calibrate.more_samples.description',
      targetClubs: ['pw'],
      targetSampleCount: 10,
      sourceSuggestionId: 'calibrate:pw',
      status: 'new',
      priorityScore: 0,
      lastCompletedAt: null,
    });
  });

  it('returns null when readiness is excellent', () => {
    const overview: BagReadinessOverview = {
      ...baseOverview,
      readiness: { ...baseOverview.readiness, grade: 'excellent', score: 96 },
    };

    const rec = buildBagPracticeRecommendation(overview, [
      {
        id: 'fill_gap:7i:8i',
        type: 'fill_gap',
        severity: 'low',
        lowerClubId: '7i',
        upperClubId: '8i',
        gapDistance: 18,
      },
    ]);

    expect(rec).toBeNull();
  });

  it('marks recommendations without history as new with zero priority', () => {
    const rec = buildBagPracticeRecommendation(baseOverview, [
      {
        id: 'calibrate:7i',
        type: 'calibrate',
        severity: 'low',
        clubId: '7i',
      },
    ]);

    expect(rec?.status).toBe('new');
    expect(rec?.priorityScore).toBe(0);
  });

  it('aggregates coverage across clubs and sorts by priority', () => {
    const suggestions: BagSuggestion[] = [
      { id: 'calibrate:7i', type: 'calibrate', severity: 'low', clubId: '7i' },
      {
        id: 'fill_gap:8i:9i',
        type: 'fill_gap',
        severity: 'high',
        lowerClubId: '8i',
        upperClubId: '9i',
        gapDistance: 20,
      },
      { id: 'calibrate:pw', type: 'calibrate', severity: 'medium', clubId: 'pw' },
    ];

    const now = new Date('2024-05-15T12:00:00.000Z');
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: 'old-gap',
        missionId: 'practice_fill_gap:8i:9i',
        startedAt: '2024-05-01T12:00:00.000Z',
        endedAt: '2024-05-01T12:30:00.000Z',
        status: 'completed',
        targetClubs: ['8i'],
        completedSampleCount: 20,
      },
      {
        id: 'fresh-calibrate',
        missionId: 'practice_calibrate:pw',
        startedAt: '2024-05-14T11:00:00.000Z',
        endedAt: '2024-05-14T11:20:00.000Z',
        status: 'completed',
        targetClubs: ['pw'],
        completedSampleCount: 12,
      },
    ];

    const recs = buildBagPracticeRecommendations(baseOverview, suggestions, history, { now });

    expect(recs.map((rec) => rec.id)).toEqual([
      'practice_calibrate:7i',
      'practice_fill_gap:8i:9i',
      'practice_calibrate:pw',
    ]);
    expect(recs[0]).toMatchObject({ status: 'new' });
    expect(recs[1]).toMatchObject({ status: 'due' });
    expect(recs[2]).toMatchObject({ status: 'fresh' });
  });

  it('builds coverage per club ignoring missing targets', () => {
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: 'missing',
        missionId: 'practice_fill_gap:8i:9i',
        startedAt: '2024-05-01T12:00:00.000Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'valid',
        missionId: 'practice_fill_gap:8i:9i',
        startedAt: '2024-05-02T12:00:00.000Z',
        status: 'completed',
        targetClubs: ['8i'],
        completedSampleCount: 10,
      },
    ];

    const coverage = buildMissionCoverageByClub(history, { now: new Date('2024-05-10T00:00:00.000Z'), windowDays: 30 });

    expect(coverage['8i']?.completed).toBe(1);
    expect(coverage['9i']).toBeUndefined();
  });

  it('returns the highest priority recommendation', () => {
    const suggestions: BagSuggestion[] = [
      { id: 'calibrate:7i', type: 'calibrate', severity: 'low', clubId: '7i' },
      { id: 'calibrate:pw', type: 'calibrate', severity: 'medium', clubId: 'pw' },
    ];

    const now = new Date('2024-05-15T12:00:00.000Z');
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: 'recent',
        missionId: 'practice_calibrate:pw',
        startedAt: '2024-05-14T12:00:00.000Z',
        endedAt: '2024-05-14T12:30:00.000Z',
        status: 'completed',
        targetClubs: ['pw'],
        completedSampleCount: 12,
      },
    ];

    const rec = getTopPracticeRecommendation({
      overview: baseOverview,
      suggestions,
      history,
      options: { now },
    });

    expect(rec).not.toBeNull();
    expect(rec?.id).toBe('practice_calibrate:7i');
  });

  it('returns null when no recommendations are available', () => {
    const rec = getTopPracticeRecommendation({ overview: null, suggestions: [], history: [] });

    expect(rec).toBeNull();
  });
});

describe('getTopPracticeRecommendationForRecap', () => {
  it('passes through the base helper result', () => {
    const overview = baseOverview;
    const history: PracticeMissionHistoryEntry[] = [];

    const rec = getTopPracticeRecommendationForRecap({ overview, history });

    expect(rec?.id).toBe('practice_fill_gap:9i:7i');
  });

  it('returns null when the base helper returns null', () => {
    const rec = getTopPracticeRecommendationForRecap({ overview: null, history: [] });

    expect(rec).toBeNull();
  });
});
