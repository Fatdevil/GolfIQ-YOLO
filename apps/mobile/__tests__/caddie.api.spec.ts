import { describe, expect, it, vi } from 'vitest';

import { fetchShotShapeProfile } from '@app/api/caddieApi';
import * as client from '@app/api/client';

describe('fetchShotShapeProfile', () => {
  it('fetches a shot-shape profile for the given club and intent', async () => {
    const response = {
      club: '7i',
      intent: 'draw',
      coreCarryMeanM: 150,
      coreCarryStdM: 5,
      coreSideMeanM: -2,
      coreSideStdM: 4,
      tailLeftProb: 0.1,
      tailRightProb: 0.05,
    } as const;

    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(response as never);

    const result = await fetchShotShapeProfile('7i', 'draw');

    expect(client.apiFetch).toHaveBeenCalledWith(
      '/api/caddie/shot-shape-profile?club=7i&intent=draw',
    );
    expect(result).toEqual(response);
  });
});
