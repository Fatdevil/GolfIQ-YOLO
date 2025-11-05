import type { LeaderboardRow, ScoreRow } from './types';

export function computeNetSimple(
  gross: number,
  hcpIndex: number | undefined | null,
  holesPlayed: number,
): number {
  const adj = Math.round((hcpIndex ?? 0) * (holesPlayed / 18));
  return Math.max(0, gross - adj);
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
  const acc = new Map<string, { gross: number; holes: number; toPar: number; last?: string }>();

  for (const r of rows) {
    const entry = acc.get(r.user_id) ?? { gross: 0, holes: 0, toPar: 0, last: undefined };
    entry.gross += r.gross;
    entry.holes += 1;
    entry.toPar += r.to_par;
    if (!entry.last || entry.last < r.ts) {
      entry.last = r.ts;
    }
    acc.set(r.user_id, entry);
  }

  const out: LeaderboardRow[] = [];
  for (const [userId, agg] of acc) {
    const holes = Math.max(agg.holes, holesPlayedByUser[userId] ?? agg.holes);
    const gross = agg.gross;
    const hcp = hcpIndexByUser[userId] ?? 0;
    const net = computeNetSimple(gross, hcp, holes);
    out.push({
      user_id: userId,
      display_name: nameByUser[userId] ?? 'Player',
      holes,
      gross,
      net,
      to_par: agg.toPar,
      last_ts: agg.last,
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
