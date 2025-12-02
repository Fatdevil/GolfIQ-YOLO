import { describe, expect, it, vi } from 'vitest';

import { analyzeRangeShot } from '@app/api/range';
import * as client from '@app/api/client';

describe('analyzeRangeShot', () => {
  it('posts analyze request to backend and normalizes snake_case metrics', async () => {
    const mockResponse = { carry_m: 150, side_deg: -4, ball_speed_mps: 65, launch_deg: 14, club_speed_mps: 42 };
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(mockResponse as never);

    const res = await analyzeRangeShot({ club: '7i', targetDistanceM: 150, cameraAngle: 'face_on', framesToken: null });

    expect(client.apiFetch).toHaveBeenCalledWith('/api/range/practice/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club: '7i', targetDistanceM: 150, cameraAngle: 'face_on', framesToken: null }),
    });
    expect(res).toEqual({
      carryM: 150,
      sideDeg: -4,
      ballSpeedMps: 65,
      launchDeg: 14,
      clubSpeedMps: 42,
      quality: null,
      summary: null,
      cues: undefined,
      id: undefined,
      tempoBackswingMs: null,
      tempoDownswingMs: null,
      tempoRatio: null,
    });
  });
});
