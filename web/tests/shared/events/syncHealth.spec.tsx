import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { pushHoleScore } from '@shared/events/service';
import {
  __setRandomProviderForTests,
  resetSyncHealthForTests,
  setResyncHandler,
} from '@shared/events/resync';
import { setSupabaseClientOverride } from '@shared/supabase/client';

import SyncHealthBadge from '../../../src/components/SyncHealthBadge';

type SupabaseQuery = {
  eq: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

describe('SyncHealthBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSyncHealthForTests();
    __setRandomProviderForTests(() => 0);
  });

  afterEach(() => {
    setResyncHandler(null);
    setSupabaseClientOverride(null);
    __setRandomProviderForTests(null);
    resetSyncHealthForTests();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function createParticipantsQuery(): SupabaseQuery {
    const query: Partial<SupabaseQuery> = {};
    const eq = vi.fn(() => query as SupabaseQuery);
    const limit = vi.fn(async () => ({
      data: [
        {
          user_id: 'user-1',
          round_id: 'round-1',
        },
      ],
      error: null,
    }));
    query.eq = eq as SupabaseQuery['eq'];
    query.limit = limit as SupabaseQuery['limit'];
    return query as SupabaseQuery;
  }

  it('enqueues resync and renders behind badge when Supabase revision is stale', async () => {
    const upsertMock = vi.fn(async () => ({
      data: [
        {
          round_revision: 2,
          scores_hash: 'remote-hash',
        },
      ],
      error: null,
    }));

    const supabase = {
      from(table: string) {
        if (table === 'event_participants') {
          return {
            select: vi.fn(() => createParticipantsQuery()),
            upsert: vi.fn(),
            update: vi.fn(),
          };
        }
        if (table === 'event_scores') {
          return {
            upsert: upsertMock,
            select: vi.fn(),
          };
        }
        return {
          select: vi.fn(() => createParticipantsQuery()),
        };
      },
    } as unknown as Record<string, unknown>;

    setSupabaseClientOverride(supabase as any);

    const resyncHandler = vi.fn();
    setResyncHandler(resyncHandler);

    await pushHoleScore({
      eventId: 'event-1',
      roundId: 'round-1',
      hole: 3,
      gross: 4,
      hcpIndex: null,
      roundRevision: 5,
      scoresHash: 'local-hash',
    });

    const markup = renderToStaticMarkup(<SyncHealthBadge />);

    expect(markup).toContain('Sync Health');
    expect(markup).toContain('Behind');
    expect(markup).toContain('local=5 remote=2');

    expect(resyncHandler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(resyncHandler).toHaveBeenCalledWith('event-1');
  });
});
