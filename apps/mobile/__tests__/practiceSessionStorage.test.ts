import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPracticeSessions, savePracticeSession } from '@app/practice/practiceSessionStorage';
import { removeItem, setItem } from '@app/storage/asyncStorage';

const LAST_KEY = 'golfiq.practice.lastSession.v1';
const LIST_KEY = 'golfiq.practice.sessions.v1';

const baseSession = {
  id: 'session-1',
  weekStartISO: '2024-03-11T00:00:00.000Z',
  startedAt: '2024-03-11T10:00:00.000Z',
  endedAt: '2024-03-11T10:20:00.000Z',
  drillIds: ['a'],
  completedDrillIds: ['a'],
  skippedDrillIds: [],
};

beforeEach(async () => {
  await removeItem(LAST_KEY);
  await removeItem(LIST_KEY);
  vi.restoreAllMocks();
});

describe('practiceSessionStorage', () => {
  it('returns an empty list when storage is empty', async () => {
    const sessions = await loadPracticeSessions();
    expect(sessions).toEqual([]);
  });

  it('migrates last session when list is missing', async () => {
    await setItem(LAST_KEY, JSON.stringify(baseSession));

    const sessions = await loadPracticeSessions();

    expect(sessions).toEqual([expect.objectContaining({ id: 'session-1' })]);
  });

  it('falls back to last session if session list is corrupted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setItem(LIST_KEY, 'not-json');
    await setItem(LAST_KEY, JSON.stringify({ ...baseSession, id: 'fallback' }));

    const sessions = await loadPracticeSessions();

    expect(sessions).toEqual([expect.objectContaining({ id: 'fallback' })]);
    warn.mockRestore();
  });

  it('trims stored sessions to the latest twenty entries', async () => {
    const many = Array.from({ length: 22 }).map((_, index) => ({
      ...baseSession,
      id: `session-${index}`,
      startedAt: new Date(Date.now() + index * 60_000).toISOString(),
      endedAt: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
    }));

    for (const session of many) {
      // eslint-disable-next-line no-await-in-loop
      await savePracticeSession(session);
    }

    const sessions = await loadPracticeSessions();

    expect(sessions).toHaveLength(20);
    expect(sessions[0].id).toBe('session-21');
    expect(sessions[sessions.length - 1].id).toBe('session-2');
  });
});
