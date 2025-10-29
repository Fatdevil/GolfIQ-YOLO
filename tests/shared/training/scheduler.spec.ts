import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePlanSessions } from '../../../shared/training/scheduler';
import type { Plan, Drill } from '../../../shared/training/types';

test('2x/week schedule generates stable weekly identifiers', () => {
  const plan: Plan = {
    id: 'test-plan',
    name: 'Test Plan',
    focus: 'putt',
    version: '1.0.0',
    drills: [{ id: 'drill-a', durationMin: 10 }],
    schedule: '2x/week',
  };
  const drills: Record<string, Drill> = {
    'drill-a': {
      id: 'drill-a',
      focus: 'putt',
      title: 'Lag putting',
      description: 'Work on distance control',
      estTimeMin: 10,
      targetMetric: { type: 'SG', segment: 'putt' },
      difficulty: 2,
    },
  };

  const reference = new Date('2025-05-05T09:00:00Z');
  const weekOne = generatePlanSessions(plan, 'putt', drills, {
    referenceDate: reference,
    weeks: 1,
  });

  assert.equal(weekOne.length, 2);
  assert.equal(new Set(weekOne.map((session) => session.id)).size, 2);

  const sameWeek = generatePlanSessions(plan, 'putt', drills, {
    referenceDate: new Date('2025-05-06T12:00:00Z'),
    weeks: 1,
  });

  assert.deepEqual(
    sameWeek.map((session) => session.id),
    weekOne.map((session) => session.id),
    'sessions should be idempotent within the same week',
  );

  const nextWeek = generatePlanSessions(plan, 'putt', drills, {
    referenceDate: new Date('2025-05-12T09:00:00Z'),
    weeks: 1,
  });

  assert.notDeepEqual(
    nextWeek.map((session) => session.id),
    weekOne.map((session) => session.id),
    'new week should yield different identifiers',
  );

  assert.ok(
    weekOne.every((session, index, array) =>
      index === 0 || session.scheduledAt >= array[index - 1].scheduledAt,
    ),
    'sessions should be sorted chronologically',
  );
});
