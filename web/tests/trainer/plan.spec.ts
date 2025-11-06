import { describe, expect, it } from 'vitest';
import { generateWeeklyPlan } from '../../../shared/trainer/plan';
import type { GoldenSnapshot, GoldenMetric } from '../../../shared/trainer/types';

describe('generateWeeklyPlan', () => {
  const metric = (overrides: Partial<GoldenMetric>): GoldenMetric => ({
    key: 'startLine',
    label: 'Start',
    value: 0,
    quality: 'ok',
    ...overrides,
  });

  const snapshot = (metrics: GoldenMetric[], idx: number): GoldenSnapshot => ({
    ts: Date.now() + idx,
    metrics,
  });

  it('selects top two weak metrics by poor percentage', () => {
    const snapshots = [
      snapshot([
        metric({ key: 'startLine', quality: 'poor' }),
        metric({ key: 'tempo', quality: 'poor' }),
        metric({ key: 'launchProxy', quality: 'good' }),
      ], 1),
      snapshot([
        metric({ key: 'startLine', quality: 'poor' }),
        metric({ key: 'tempo', quality: 'ok' }),
        metric({ key: 'dynLoftProxy', quality: 'poor' }),
      ], 2),
    ];

    const plan = generateWeeklyPlan(snapshots);
    expect(plan.focus).toEqual(['startLine', 'dynLoftProxy']);
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions[0].drills[0]).toBe('Start line gates');
    expect(plan.sessions[0].drills).toContain('Shaft lean rehearsals');
  });

  it('falls back to baseline focus when no poor metrics', () => {
    const snapshots = [
      snapshot([
        metric({ key: 'startLine', quality: 'good' }),
        metric({ key: 'tempo', quality: 'ok' }),
      ], 1),
    ];

    const plan = generateWeeklyPlan(snapshots, { sessions: 2 });
    expect(plan.focus).toEqual(['startLine', 'tempo']);
    expect(plan.sessions).toHaveLength(2);
    expect(plan.sessions[0].drills).toContain('Start line gates');
    expect(plan.sessions[0].drills).toContain('Tempo 3:1 metronome');
  });
});
