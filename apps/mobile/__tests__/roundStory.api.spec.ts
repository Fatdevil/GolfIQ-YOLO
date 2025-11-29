import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '@app/api/client';
import {
  fetchCoachRoundSummary,
  fetchRoundSg,
  fetchSessionTimeline,
  type CoachRoundSummary,
} from '@app/api/roundStory';

vi.mock('@app/api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

describe('round story api', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('fetches strokes gained preview', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      runId: 'r1',
      total_sg: 0.5,
      sg_by_cat: { TEE: 0.2, APPROACH: -0.1, SHORT: 0.3, PUTT: 0.1 },
    });

    const result = await fetchRoundSg('r1');

    expect(apiFetch).toHaveBeenCalledWith('/api/sg/run/r1');
    expect(result.total).toBe(0.5);
    expect(result.categories.find((c) => c.name === 'Off tee')?.strokesGained).toBeCloseTo(0.2);
    expect(result.categories.find((c) => c.name === 'Approach')?.strokesGained).toBeCloseTo(-0.1);
  });

  it('fetches session timeline', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ runId: 'r1', events: [] });

    const result = await fetchSessionTimeline('r1');

    expect(apiFetch).toHaveBeenCalledWith('/api/session/r1/timeline');
    expect(result).toEqual({ runId: 'r1', events: [] });
  });

  it('maps coach round summary into strengths and focus', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      sg_total: -0.4,
      sg_by_category: [
        { name: 'TEE', sg: 0.5 },
        { name: 'APPROACH', sg: -0.8 },
      ],
      diagnosis: { findings: [{ title: 'Lag putting', severity: 'warning' }] },
    });

    const result = (await fetchCoachRoundSummary('run-5')) as CoachRoundSummary;

    expect(apiFetch).toHaveBeenCalledWith('/api/coach/round-summary/run-5');
    expect(result.strengths[0]).toContain('Off tee');
    expect(result.focus[0]).toContain('Lag putting');
  });

  it('returns null on 403 coach summary', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError('forbidden', 403));

    const result = await fetchCoachRoundSummary('run-6');

    expect(result).toBeNull();
  });
});

