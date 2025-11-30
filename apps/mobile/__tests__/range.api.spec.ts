import { describe, expect, it, vi } from 'vitest';

import { analyzeRangeShot } from '@app/api/range';
import * as client from '@app/api/client';

describe('analyzeRangeShot', () => {
  it('posts analyze request to backend', async () => {
    const mockResponse = { carryM: 150, sideDeg: 2 };
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(mockResponse as never);

    const res = await analyzeRangeShot({ club: '7i', targetDistanceM: 150, cameraAngle: 'face_on', framesToken: null });

    expect(client.apiFetch).toHaveBeenCalledWith('/api/range/practice/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club: '7i', targetDistanceM: 150, cameraAngle: 'face_on', framesToken: null }),
    });
    expect(res).toEqual(mockResponse);
  });
});
