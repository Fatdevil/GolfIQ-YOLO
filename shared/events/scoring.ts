import type { LeaderboardRow, ScoreRow } from './types';

export function computeNetSimple(
  gross: number,
  hcpIndex: number | undefined | null,
  holesPlayed: number,
): number {
  const adj = Math.round((hcpIndex ?? 0) * (holesPlayed / 18));
  return Math.max(0, gross - adj);
}

type AggEntry = {
  gross: number;
  net: number;
  holes: number;
  toPar: number;
  last?: string;
  stableford: number;
  hasStableford: boolean;
  playingHandicap: number | null;
  netFromRows: boolean;
};

export type AggregatedScoreEntry = AggEntry;

export function aggregateScoreRows(rows: ScoreRow[]): Map<string, AggEntry> {
  const acc = new Map<string, AggEntry>();
  for (const r of rows) {
    const entry =
      acc.get(r.user_id) ?? {
        gross: 0,
        net: 0,
        holes: 0,
        toPar: 0,
        last: undefined,
        stableford: 0,
        hasStableford: false,
        playingHandicap: null,
        netFromRows: false,
      };
    entry.gross += r.gross;
    entry.holes += 1;
    entry.toPar += r.to_par;
    if (Number.isFinite(r.net)) {
      const n = Number(r.net);
      entry.net += n;
      if (n !== r.gross) entry.netFromRows = true;
    }
    if (!entry.last || entry.last < r.ts) {
      entry.last = r.ts;
    }
    if (Number.isFinite(r.stableford ?? NaN)) {
      entry.stableford += Number(r.stableford);
      entry.hasStableford = true;
    }
    if (Number.isFinite(r.playing_handicap ?? NaN)) {
      entry.playingHandicap = Number(r.playing_handicap);
    }
    acc.set(r.user_id, entry);
  }
  return acc;
}

export function aggregateLeaderboard(
  rows: ScoreRow[],
  nameByUser: Record<string, string>,
  opts?: {
    hcpIndexByUser?: Record<string, number | undefined | null>;
    holesPlayedByUser?: Record<string, number>;
  },
): LeaderboardRow[] {
  const { hcpIndexByUser = {}, holesPlayedByUser = {} } = opts ?? {};
  const acc = aggregateScoreRows(rows);
  const out: LeaderboardRow[] = [];
  for (const [userId, agg] of acc) {
    const holes = Math.max(agg.holes, holesPlayedByUser[userId] ?? agg.holes);
    const gross = agg.gross;
    let netTotal = agg.net;
    if (!agg.netFromRows) {
      const fallbackHcp = hcpIndexByUser[userId] ?? 0;
      netTotal = computeNetSimple(gross, fallbackHcp, holes);
    }
    out.push({
      user_id: userId,
      display_name: nameByUser[userId] ?? 'Player',
      holes,
      gross,
      net: netTotal,
      to_par: agg.toPar,
      last_ts: agg.last,
      stableford: agg.hasStableford ? agg.stableford : undefined,
      playing_handicap: agg.playingHandicap !== null ? agg.playingHandicap : undefined,
    });
  }

  return out.sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net;
    if (a.gross !== b.gross) return a.gross - b.gross;
    if ((a.last_ts ?? '') < (b.last_ts ?? '')) return 1;
    if ((a.last_ts ?? '') > (b.last_ts ?? '')) return -1;
    return 0;
  });
}
