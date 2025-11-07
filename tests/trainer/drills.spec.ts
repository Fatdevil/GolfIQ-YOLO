import { describe, expect, it } from 'vitest';

import { buildGoldenDrillTiles } from '../../shared/trainer/drills';
import { generateWeeklyPlan } from '../../shared/trainer/plan';
import type { GoldenSnapshot } from '../../shared/trainer/types';

describe('trainer drills', () => {
  it('computes weighted EMA for drill tiles', () => {
    const snapshots: GoldenSnapshot[] = [
      {
        ts: 1,
        club: '7i',
        metrics: [
          {
            key: 'startLine',
            label: 'Start line',
            unit: '°',
            value: 2.4,
            quality: 'poor',
            sampleCount: 50,
          },
        ],
      },
      {
        ts: 2,
        club: '7i',
        metrics: [
          {
            key: 'startLine',
            label: 'Start line',
            unit: '°',
            value: 1.2,
            quality: 'ok',
            sampleCount: 50,
          },
        ],
      },
      {
        ts: 3,
        club: '7i',
        metrics: [
          {
            key: 'startLine',
            label: 'Start line',
            unit: '°',
            value: 0.3,
            quality: 'good',
            sampleCount: 1,
          },
        ],
      },
    ];

    const tiles = buildGoldenDrillTiles(snapshots, { alpha: 0.2 });
    expect(tiles).toHaveLength(1);
    const tile = tiles[0];
    expect(tile.key).toBe('startLine');
    expect(tile.quickDrills).toHaveLength(3);
    expect(tile.samples).toBeGreaterThan(0);
    expect(tile.ema).toBeCloseTo(1.02, 2);
    expect(tile.delta).toBeCloseTo(tile.today! - tile.ema!, 6);
    expect(tile.target).toEqual({ min: -1, max: 1 });
  });

  it('builds weekly plan focus from poor metrics', () => {
    const snapshots: GoldenSnapshot[] = [
      {
        ts: 10,
        metrics: [
          { key: 'startLine', label: 'Start line', unit: '°', value: 3, quality: 'poor', sampleCount: 1 },
          { key: 'tempo', label: 'Tempo', unit: '×', value: 4.2, quality: 'poor', sampleCount: 1 },
        ],
      },
      {
        ts: 20,
        metrics: [
          { key: 'startLine', label: 'Start line', unit: '°', value: 2.6, quality: 'poor', sampleCount: 1 },
          { key: 'tempo', label: 'Tempo', unit: '×', value: 3.9, quality: 'ok', sampleCount: 1 },
        ],
      },
    ];

    const plan = generateWeeklyPlan(snapshots, { sessions: 2 });
    expect(plan.focus).toContain('startLine');
    expect(plan.focus.length).toBeGreaterThan(0);
    expect(plan.sessions).toHaveLength(2);
    expect(plan.sessions[0].drills.length).toBeGreaterThan(0);
    expect(plan.sessions[0].drills[0]).toBeDefined();
  });
});
