import { describe, expect, it } from 'vitest';

import { buildHighlights, buildRoundStoryViewModel } from '@app/roundStory/model';

describe('round story model', () => {
  it('builds highlights from timeline events', () => {
    const highlights = buildHighlights([
      { ts: 0.1, type: 'peak_hips' },
      { ts: 0.25, type: 'tempo_marker', data: { total_s: 0.9 } },
      { ts: 0.4, type: 'impact', label: 'Impact #1' },
    ]);

    expect(highlights).toEqual([
      'Hips peak at 0.10s',
      'Tempo recorded: 0.90s',
      'Impact #1 (0.40s)',
    ]);
  });

  it('builds view model with pro gating', () => {
    const vm = buildRoundStoryViewModel({
      runId: 'run-1',
      summary: {
        runId: 'run-1',
        courseName: 'Pebble',
        teeName: 'Blue',
        holes: 18,
        totalStrokes: 72,
        finishedAt: '2024-01-01T00:00:00.000Z',
      },
      sg: { total: 1.2, categories: [] },
      highlights: ['Impact'],
      coach: { strengths: ['Driving'], focus: ['Putting'] },
      isPro: true,
    });

    expect(vm.sg?.total).toBe(1.2);
    expect(vm.highlights).toEqual(['Impact']);
    expect(vm.strengths).toContain('Driving');
    expect(vm.focus).toContain('Putting');
  });

  it('hides analytics when not pro', () => {
    const vm = buildRoundStoryViewModel({
      runId: 'run-1',
      summary: null,
      sg: { total: 1.2, categories: [] },
      highlights: ['Impact'],
      coach: { strengths: ['Driving'], focus: ['Putting'] },
      isPro: false,
    });

    expect(vm.sg).toBeUndefined();
    expect(vm.highlights).toEqual([]);
    expect(vm.strengths).toEqual([]);
    expect(vm.focus).toEqual([]);
  });
});

