import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

import { generateCode } from '@shared/events/code';

const PORT = 8099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server: ReturnType<typeof spawn> | null = null;

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore until server ready
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not become healthy in time');
}

beforeAll(async () => {
  server = spawn('python3', [
    '-m',
    'uvicorn',
    'server.app:app',
    '--host',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--log-level',
    'warning',
  ], {
    env: { ...process.env, REQUIRE_API_KEY: '0' },
    stdio: 'inherit',
  });
  await waitForHealth();
});

afterAll(() => {
  if (server) {
    server.kill('SIGTERM');
    server = null;
  }
});

describe('events api', () => {
  it('creates events and returns join metadata', async () => {
    const createResponse = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Club Night', emoji: '⛳️' }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      code: string;
      joinUrl: string;
      qrSvg: string;
    };
    expect(created.id).toBeTruthy();
    expect(created.code).toMatch(/^[A-Z0-9]{7}$/);
    expect(created.joinUrl).toContain(created.code);
    expect(created.qrSvg.startsWith('<svg')).toBe(true);

    const joinResponse = await fetch(`${BASE_URL}/join/${created.code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest' }),
    });
    expect(joinResponse.status).toBe(200);
    const joined = (await joinResponse.json()) as { eventId: string };
    expect(joined.eventId).toBe(created.id);

    const boardResponse = await fetch(`${BASE_URL}/events/${created.id}/board`);
    expect(boardResponse.status).toBe(200);
    const board = (await boardResponse.json()) as { players: Array<Record<string, unknown>>; updatedAt: string | null };
    expect(Array.isArray(board.players)).toBe(true);
    expect(board.players.length).toBeGreaterThan(0);
    for (const player of board.players) {
      expect(Object.keys(player).sort()).toEqual(['gross', 'hole', 'name', 'net', 'status', 'thru'].sort());
    }
    if (board.updatedAt) {
      expect(() => new Date(board.updatedAt).toISOString()).not.toThrow();
    }
  });

  it('returns 404 for unknown join codes', async () => {
    const unknownCode = generateCode();
    const response = await fetch(`${BASE_URL}/join/${unknownCode}`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
