import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchLiveRoundSnapshot, pollLiveRoundSnapshot } from '@shared/events/service';
import type { LiveSpectatorSnapshot } from '@shared/events/types';
import { setSupabaseClientOverride, type SupabaseClientLike } from '@shared/supabase/client';

function makeQueryBuilder(getData: () => unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      const data = getData();
      if (Array.isArray(data)) {
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    },
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const payload = { data: getData(), error: null } as const;
      return Promise.resolve(resolve(payload));
    },
    catch: () => builder,
  };
  return builder;
}

describe('live spectator snapshot', () => {
  afterEach(() => {
    setSupabaseClientOverride(null);
    vi.useRealTimers();
  });

  it('aggregates stableford leaderboard and highlights top shots', async () => {
    const eventRow = {
      event_id: 'event-1',
      name: 'Club Night',
      status: 'open',
      scoring_format: 'stableford',
      allowance_pct: 95,
    };
    const nowIso = new Date().toISOString();
    const scoreRows = [
      {
        event_id: 'event-1',
        round_id: 'round-1',
        spectator_id: 'player-a',
        user_id: 'user-a',
        display_name: 'Alice',
        hcp_index: 4.2,
        hole_no: 1,
        gross: 4,
        net: 3,
        stableford: 3,
        to_par: 0,
        par: 4,
        ts: nowIso,
      },
      {
        event_id: 'event-1',
        round_id: 'round-1',
        spectator_id: 'player-a',
        user_id: 'user-a',
        display_name: 'Alice',
        hcp_index: 4.2,
        hole_no: 2,
        gross: 3,
        net: 2,
        stableford: 4,
        to_par: -1,
        par: 4,
        ts: nowIso,
      },
      {
        event_id: 'event-1',
        round_id: 'round-1',
        spectator_id: 'player-b',
        user_id: 'user-b',
        display_name: 'Ben',
        hcp_index: 8.8,
        hole_no: 1,
        gross: 5,
        net: 4,
        stableford: 2,
        to_par: 1,
        par: 4,
        ts: nowIso,
      },
    ];
    const baseTs = Date.now();
    const shotsRows = [
      {
        event_id: 'event-1',
        round_id: 'round-1',
        shot_public_id: 'shot-1',
        hole: 5,
        seq: 1,
        club: '7I',
        carry_m: 158,
        plays_like_pct: 1.5,
        strokes_gained: 0.4,
        start_ts_ms: baseTs,
        updated_at: new Date(baseTs).toISOString(),
      },
      {
        event_id: 'event-1',
        round_id: 'round-1',
        shot_public_id: 'shot-2',
        hole: 8,
        seq: 1,
        club: '5I',
        carry_m: 182,
        plays_like_pct: 0.8,
        strokes_gained: 0.9,
        start_ts_ms: baseTs + 1200,
        updated_at: new Date(baseTs + 1200).toISOString(),
      },
    ];

    const supa = {
      from: (table: string) => {
        switch (table) {
          case 'event_live_public_events':
            return makeQueryBuilder(() => eventRow);
          case 'event_live_round_scores':
            return makeQueryBuilder(() => scoreRows);
          case 'event_live_round_shots':
            return makeQueryBuilder(() => shotsRows);
          default:
            throw new Error(`unexpected table ${table}`);
        }
      },
    } as unknown as SupabaseClientLike;

    setSupabaseClientOverride(supa);

    const snapshot = await fetchLiveRoundSnapshot('event-1', 'round-1');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.format).toBe('stableford');
    expect(snapshot?.players[0]?.name).toBe('Alice');
    expect(snapshot?.players[0]?.stableford).toBe(7);
    expect(snapshot?.players[1]?.name).toBe('Ben');
    expect(snapshot?.topShots[0]?.id).toBe('shot-2');
    expect(snapshot?.topShots[0]?.carry).toBe(182);
  });

  it('pollLiveRoundSnapshot emits successive snapshots', async () => {
    vi.useFakeTimers();
    const eventRow = {
      event_id: 'event-1',
      name: 'Club Night',
      status: 'open',
      scoring_format: 'stroke',
      allowance_pct: 95,
    };
    let scoreCall = 0;
    const scoreSets = [
      [
        {
          event_id: 'event-1',
          round_id: 'round-1',
          spectator_id: 'player-a',
          user_id: 'user-a',
          display_name: 'Alice',
          hcp_index: 4.2,
          hole_no: 1,
          gross: 4,
          net: 3,
          stableford: null,
          to_par: 0,
          par: 4,
          ts: new Date().toISOString(),
        },
      ],
      [
        {
          event_id: 'event-1',
          round_id: 'round-1',
          spectator_id: 'player-a',
          user_id: 'user-a',
          display_name: 'Alice',
          hcp_index: 4.2,
          hole_no: 1,
          gross: 4,
          net: 3,
          stableford: null,
          to_par: 0,
          par: 4,
          ts: new Date().toISOString(),
        },
        {
          event_id: 'event-1',
          round_id: 'round-1',
          spectator_id: 'player-a',
          user_id: 'user-a',
          display_name: 'Alice',
          hcp_index: 4.2,
          hole_no: 2,
          gross: 5,
          net: 4,
          stableford: null,
          to_par: 1,
          par: 4,
          ts: new Date().toISOString(),
        },
      ],
    ];
    const shotsRows = [
      {
        event_id: 'event-1',
        round_id: 'round-1',
        shot_public_id: 'shot-1',
        hole: 3,
        seq: 1,
        club: '9I',
        carry_m: 140,
        plays_like_pct: 1.2,
        strokes_gained: 0.3,
        start_ts_ms: Date.now(),
        updated_at: new Date().toISOString(),
      },
    ];

    const supa = {
      from: (table: string) => {
        switch (table) {
          case 'event_live_public_events':
            return makeQueryBuilder(() => eventRow);
          case 'event_live_round_scores':
            return makeQueryBuilder(() => scoreSets[Math.min(scoreCall++, scoreSets.length - 1)]);
          case 'event_live_round_shots':
            return makeQueryBuilder(() => shotsRows);
          default:
            throw new Error(`unexpected table ${table}`);
        }
      },
    } as unknown as SupabaseClientLike;

    setSupabaseClientOverride(supa);

    const received: LiveSpectatorSnapshot[] = [];
    const stop = await pollLiveRoundSnapshot(
      'event-1',
      'round-1',
      (snapshot) => {
        received.push(snapshot);
      },
      200,
    );

    expect(received).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(250);
    await vi.runOnlyPendingTimersAsync();
    expect(received).toHaveLength(2);
    stop();
  });
});
