import { afterEach, describe, expect, test } from 'vitest';

import type { ShotEvent } from '../../../../shared/round/types';
import {
  __TESTING__,
  appendHoleAccuracy,
  computeConfusion,
  exportAccuracyNdjson,
} from '../../../../shared/telemetry/shotsenseMetrics';

function buildShot(ts: number, source: string = 'manual'): ShotEvent {
  return {
    id: `shot-${ts}`,
    hole: 1,
    seq: 1,
    kind: 'Full',
    start: { lat: 0, lon: 0, ts },
    startLie: 'Fairway',
    source,
  };
}

afterEach(() => {
  __TESTING__.clear();
});

describe('computeConfusion', () => {
  test('returns perfect detection metrics', () => {
    const auto: ShotEvent[] = [buildShot(1_000, 'auto'), buildShot(5_000, 'auto')];
    const confirmed: ShotEvent[] = [buildShot(1_100), buildShot(5_050)];
    expect(computeConfusion(auto, confirmed)).toEqual({ tp: 2, fp: 0, fn: 0 });
  });

  test('counts false positives when auto has extra shot', () => {
    const auto: ShotEvent[] = [buildShot(2_000, 'auto'), buildShot(4_000, 'auto')];
    const confirmed: ShotEvent[] = [buildShot(2_050)];
    expect(computeConfusion(auto, confirmed)).toEqual({ tp: 1, fp: 1, fn: 0 });
  });

  test('counts false negatives when manual shot missing auto match', () => {
    const auto: ShotEvent[] = [buildShot(6_000, 'auto')];
    const confirmed: ShotEvent[] = [buildShot(6_020), buildShot(9_000)];
    expect(computeConfusion(auto, confirmed)).toEqual({ tp: 1, fp: 0, fn: 1 });
  });
});

describe('appendHoleAccuracy + exportAccuracyNdjson', () => {
  test('serializes NDJSON rows', () => {
    appendHoleAccuracy('round-1', 3, { tp: 2, fp: 0, fn: 0 });
    appendHoleAccuracy('round-1', 4, { tp: 1, fp: 1, fn: 0 });
    const text = exportAccuracyNdjson();
    const lines = text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({ roundId: 'round-1', hole: 3, tp: 2, fp: 0, fn: 0 });
    expect(parsed[1]).toMatchObject({ roundId: 'round-1', hole: 4, tp: 1, fp: 1, fn: 0 });
  });
});
