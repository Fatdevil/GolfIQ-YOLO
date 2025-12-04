import {
  appendShot,
  endRound,
  getRoundScores,
  getRoundSummary,
  fetchRoundRecap,
  listRoundSummaries,
  listRounds,
  listRoundShots,
  startRound,
  updateHoleScore,
} from '@app/api/roundClient';
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
      tempoBackswingMs: 920,
      tempoDownswingMs: 310,
      tempoRatio: 2.97,
    };
    mockFetch.mockResolvedValueOnce(mockResponse(shot));
    mockFetch.mockResolvedValueOnce(mockResponse([shot]));

    const created = await appendShot('r1', {
      holeNumber: 1,
      club: '7i',
      startLat: 0,
      startLon: 0,
      tempoBackswingMs: 920,
      tempoDownswingMs: 310,
      tempoRatio: 2.97,
    });
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

  it('fetches and updates scores', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        roundId: 'r1',
        holes: { '1': { holeNumber: 1, par: 4, strokes: 5 } },
      }),
    );

    const scores = await getRoundScores('r1');
    expect(scores.holes[1].strokes).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/r1/scores', expect.anything());

    mockFetch.mockResolvedValueOnce(
      mockResponse({ roundId: 'r1', holes: { '1': { holeNumber: 1, par: 4, strokes: 4, putts: 2 } } }),
    );

    const updated = await updateHoleScore('r1', 1, { strokes: 4, putts: 2 });
    expect(updated.holes[1].putts).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/rounds/r1/scores/1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('fetches round summary', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        roundId: 'r1',
        totalStrokes: 72,
        totalPar: 70,
        totalToPar: 2,
        holesPlayed: 18,
      }),
    );

    const summary = await getRoundSummary('r1');
    expect(summary.totalToPar).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/r1/summary', expect.anything());
  });

  it('fetches round recap', async () => {
    const payload = {
      roundId: 'r1',
      courseName: 'Test Course',
      date: '2024-01-01',
      score: 80,
      toPar: '+8',
      holesPlayed: 18,
      categories: {},
      focusHints: [],
    };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const recap = await fetchRoundRecap('r1');
    expect(recap.score).toBe(80);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/r1/recap', expect.anything());
  });

  it('lists rounds with optional limit', async () => {
    const payload = [
      { id: 'r1', holes: 18, startedAt: '2024-01-01T00:00:00Z', courseName: 'Pebble' },
    ];
    mockFetch.mockResolvedValue(mockResponse(payload));

    const rounds = await listRounds(10);
    expect(rounds).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds?limit=10', expect.anything());
  });

  it('lists round summaries with optional limit', async () => {
    const payload = [
      {
        roundId: 'r1',
        totalStrokes: 72,
        totalPar: 70,
        totalToPar: 2,
        holesPlayed: 18,
      },
    ];
    mockFetch.mockResolvedValue(mockResponse(payload));

    const summaries = await listRoundSummaries();
    expect(summaries).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/rounds/summaries', expect.anything());
  });
});
