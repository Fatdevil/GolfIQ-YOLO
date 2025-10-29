import assert from 'node:assert/strict';
import test from 'node:test';

import { computeFocusTrend } from '../../../shared/sg/trend';
import type { FocusSgSample } from '../../../shared/sg/trend';

test('computeFocusTrend returns deltas for recent windows', () => {
  const now = new Date('2025-05-15T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  const samples: FocusSgSample[] = [
    { focus: 'putt', sg: 0.5, recordedAt: new Date(now.getTime() - 2 * day) },
    { focus: 'putt', sg: 0.1, recordedAt: new Date(now.getTime() - 3 * day) },
    { focus: 'putt', sg: 0.2, recordedAt: new Date(now.getTime() - 9 * day) },
    { focus: 'putt', sg: -0.2, recordedAt: new Date(now.getTime() - 20 * day) },
    { focus: 'putt', sg: 0.05, recordedAt: new Date(now.getTime() - 40 * day) },
    { focus: 'tee', sg: 0.3, recordedAt: new Date(now.getTime() - 45 * day) },
  ];

  const trend = computeFocusTrend(samples, now);

  assert.ok(trend.putt, 'putt trend should be present');
  assert.equal(Object.hasOwn(trend, 'tee'), false, 'tee should be omitted without recent data');

  const puttTrend = trend.putt!;
  assert.equal(Number(puttTrend.d7.toFixed(2)), 0.1);
  assert.equal(Number(puttTrend.d30.toFixed(2)), 0.1);
});

test('computeFocusTrend handles empty input', () => {
  const trend = computeFocusTrend([], Date.now());
  assert.deepEqual(trend, {});
});
