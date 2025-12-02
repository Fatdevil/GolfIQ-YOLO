import { describe, expect, it, vi } from 'vitest';

import { fetchClubDistances } from '@app/api/clubDistanceClient';
import * as client from '@app/api/client';

describe('fetchClubDistances', () => {
  it('fetches club distances for the current player', async () => {
    const mockResponse = [
      { club: '7i', samples: 10, baselineCarryM: 150, carryStdM: 6, lastUpdated: '2024-05-01T00:00:00Z' },
    ];
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(mockResponse as never);

    const result = await fetchClubDistances();

    expect(client.apiFetch).toHaveBeenCalledWith('/api/player/club-distances');
    expect(result).toEqual(mockResponse);
  });
});
