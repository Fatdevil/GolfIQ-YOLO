import { describe, expect, it } from 'vitest';

import { DEFAULT_HISTORY_WINDOW_DAYS, type MissionProgress } from '@shared/practice/practiceHistory';
import { buildPracticeMissionsList, type PracticeMissionDefinition } from '@shared/practice/practiceMissionsList';

describe('buildPracticeMissionsList', () => {
  const missions: PracticeMissionDefinition[] = [
    { id: 'practice_fill_gap:7i:5w', title: 'Mission A' },
    { id: 'mission_b', title: 'Mission B' },
    { id: 'mission_c', title: 'Mission C' },
  ];

  function progress(overrides: Partial<MissionProgress> = {}): MissionProgress {
    return {
      missionId: overrides.missionId ?? 'mission_a',
      completedSessions: overrides.completedSessions ?? 0,
      lastCompletedAt: overrides.lastCompletedAt ?? null,
      inStreak: overrides.inStreak ?? false,
    };
  }

  it('prioritizes highlighted missions from bag readiness', () => {
    const bagReadiness = {
      readiness: { grade: 'poor', score: 30, totalClubs: 0, calibratedClubs: 0, needsMoreSamplesCount: 0, noDataCount: 0, largeGapCount: 0, overlapCount: 0 },
      suggestions: [
        { id: 'fill', type: 'fill_gap', lowerClubId: '7i', upperClubId: '5w', severity: 'high' },
      ],
      dataStatusByClubId: {},
    } as any;

    const list = buildPracticeMissionsList({
      bagReadiness,
      missionProgressById: { 'practice_fill_gap:7i:5w': progress({ missionId: 'practice_fill_gap:7i:5w' }) },
      missions,
      now: new Date('2024-01-10T00:00:00Z'),
    });

    expect(list[0].id).toBe('practice_fill_gap:7i:5w');
    expect(list[0].status === 'overdue' || list[0].status === 'recommended').toBe(true);
  });

  it('marks never-completed missions as due soon', () => {
    const list = buildPracticeMissionsList({
      bagReadiness: null,
      missionProgressById: {},
      missions,
      now: new Date('2024-01-10T00:00:00Z'),
    });

    expect(list.map((m) => m.status)).toEqual(['dueSoon', 'dueSoon', 'dueSoon']);
  });

  it('marks recent completions as completedRecently', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const list = buildPracticeMissionsList({
      bagReadiness: null,
      missionProgressById: {
        mission_b: progress({ missionId: 'mission_b', lastCompletedAt: now.getTime() - DAY_MS }),
      },
      missions,
      now,
    });

    expect(list.find((m) => m.id === 'mission_b')?.status).toBe('completedRecently');
  });

  it('pushes stale missions to dueSoon', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const stale = now.getTime() - (DEFAULT_HISTORY_WINDOW_DAYS + 1) * DAY_MS;
    const list = buildPracticeMissionsList({
      bagReadiness: null,
      missionProgressById: {
        mission_c: progress({ missionId: 'mission_c', lastCompletedAt: stale, completedSessions: 2 }),
      },
      missions,
      now,
    });

    expect(list.find((m) => m.id === 'mission_c')?.status).toBe('dueSoon');
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
