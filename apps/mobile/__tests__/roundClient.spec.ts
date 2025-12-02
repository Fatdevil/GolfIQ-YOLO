import { appendShot, endRound, listRoundShots, startRound } from '@app/api/roundClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

function mockResponse(data: any) {
  return { ok: true, json: async () => data, text: async () => '' } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
});

describe('roundClient', () => {
  it('starts a round', async () => {
    const payload = { id: 'r1', holes: 18, startedAt: '2024-01-01T00:00:00Z' };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const result = await startRound({ courseId: 'c1', teeName: 'Blue', holes: 18 });

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/rounds/start',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('appends and lists shots', async () => {
    const shot = {
      id: 's1',
      roundId: 'r1',
      holeNumber: 1,
      club: '7i',
      createdAt: '2024-01-01T00:00:00Z',
      startLat: 0,
      startLon: 0,
    };
    mockFetch.mockResolvedValueOnce(mockResponse(shot));
    mockFetch.mockResolvedValueOnce(mockResponse([shot]));

    const created = await appendShot('r1', { holeNumber: 1, club: '7i', startLat: 0, startLon: 0 });
    expect(created).toEqual(shot);

    const listed = await listRoundShots('r1');
    expect(listed).toEqual([shot]);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/r1/shots', expect.anything());
  });

  it('ends a round', async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: 'r1', holes: 18, startedAt: 'now', endedAt: 'later' }));

    await endRound('r1');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/r1/end', expect.objectContaining({ method: 'POST' }));
  });
});
