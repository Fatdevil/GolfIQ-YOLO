import { describe, expect, it, vi, beforeEach } from 'vitest';

import { apiFetch } from '@app/api/client';
import { createRunForCurrentRound, submitScorecard } from '@app/api/runs';
import type { CurrentRun } from '@app/run/currentRun';

vi.mock('@app/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('runs api', () => {
  const run: CurrentRun = {
    courseId: 'c1',
    courseName: 'Pebble',
    teeId: 't1',
    teeName: 'Blue',
    holes: 18,
    startedAt: '2024-01-01T00:00:00.000Z',
    mode: 'strokeplay',
    currentHole: 1,
    scorecard: {
      1: { strokes: 4, putts: 2, fir: true },
    },
  };

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('posts to mobile run creation', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ runId: 'run-1' });
    const result = await createRunForCurrentRound(run);

    expect(result).toEqual({ runId: 'run-1' });
    expect(apiFetch).toHaveBeenCalledWith('/api/mobile/runs', expect.objectContaining({ method: 'POST' }));
  });

  it('submits scorecard payload', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});

    await submitScorecard('run-2', run);

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/runs/run-2/score',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const payload = JSON.parse((vi.mocked(apiFetch).mock.calls[0][1] as any).body);
    expect(payload.payload.scores[0]).toEqual({ hole: 1, strokes: 4, putts: 2, gir: false, fir: true });
    expect(payload.dedupeKey).toContain('run-2');
  });
});
