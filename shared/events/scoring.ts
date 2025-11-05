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
  holesPlayedByUser: Record<string, number>,
): LeaderboardRow[] {
  const acc = new Map<string, LeaderboardRow>();
  for (const r of rows) {
    const current =
      acc.get(r.user_id) ??
      ({
        user_id: r.user_id,
        display_name: nameByUser[r.user_id] ?? 'Player',
        holes: 0,
        gross: 0,
        net: 0,
        to_par: 0,
        last_ts: undefined,
      } satisfies LeaderboardRow);

    current.holes += 1;
    current.gross += r.gross;
    current.net += r.net;
    current.to_par += r.to_par;
    if (!current.last_ts || current.last_ts < r.ts) {
      current.last_ts = r.ts;
    }
    acc.set(r.user_id, current);
  }

  const out = Array.from(acc.values());
  for (const row of out) {
    const holes = holesPlayedByUser[row.user_id];
    if (typeof holes === 'number') {
      row.holes = Math.max(row.holes, holes);
    }
  }

  return out.sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net;
    if (a.gross !== b.gross) return a.gross - b.gross;
    if ((a.last_ts ?? '') < (b.last_ts ?? '')) return 1;
    if ((a.last_ts ?? '') > (b.last_ts ?? '')) return -1;
    return 0;
  });
}
