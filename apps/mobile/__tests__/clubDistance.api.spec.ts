import { describe, expect, it, vi } from 'vitest';

import {
  clearClubDistanceOverride,
  fetchClubDistances,
  setClubDistanceOverride,
} from '@app/api/clubDistanceClient';
import * as client from '@app/api/client';

describe('fetchClubDistances', () => {
  it('fetches club distances for the current player', async () => {
    const mockResponse = [
      {
        club: '7i',
        samples: 10,
        baselineCarryM: 150,
        carryStdM: 6,
        manualCarryM: null,
        source: 'auto',
        lastUpdated: '2024-05-01T00:00:00Z',
      },
    ];
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(mockResponse as never);

    const result = await fetchClubDistances();

    expect(client.apiFetch).toHaveBeenCalledWith('/api/player/club-distances');
    expect(result).toEqual(mockResponse);
  });
});

describe('manual overrides', () => {
  it('sets a manual override', async () => {
    const response = {
      club: '7i',
      samples: 12,
      baselineCarryM: 150,
      carryStdM: 5,
      manualCarryM: 155,
      source: 'manual',
      lastUpdated: '2024-05-01T00:00:00Z',
    };

    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(response as never);

    const result = await setClubDistanceOverride('7i', 155);

    expect(client.apiFetch).toHaveBeenCalledWith(
      '/api/player/club-distances/7i/override',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ manualCarryM: 155, source: 'manual' }),
      }),
    );
    expect(result).toEqual(response);
  });

  it('clears a manual override', async () => {
    const response = {
      club: '7i',
      samples: 12,
      baselineCarryM: 150,
      carryStdM: 5,
      manualCarryM: null,
      source: 'auto',
      lastUpdated: '2024-05-01T00:00:00Z',
    };

    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(response as never);

    const result = await clearClubDistanceOverride('7i');

    expect(client.apiFetch).toHaveBeenCalledWith(
      '/api/player/club-distances/7i/override',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result).toEqual(response);
  });
});
