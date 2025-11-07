import type { LeaderboardRow, ScoreRow, ScoringFormat } from './types';

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
  last?: { ts: number; iso: string | null };
  format?: ScoringFormat;
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
      const netValue = Number(r.net);
      entry.net += netValue;
      if (netValue !== r.gross) {
        entry.netFromRows = true;
      }
    }
    const tsValue = typeof r.ts === 'string' ? Date.parse(r.ts) : Number(r.ts);
    if (Number.isFinite(tsValue)) {
      const ts = Number(tsValue);
      if (!entry.last || ts >= entry.last.ts) {
        entry.last = { ts, iso: typeof r.ts === 'string' ? r.ts : new Date(ts).toISOString() };
      }
    }
    if (Number.isFinite(r.stableford ?? NaN)) {
      entry.stableford += Number(r.stableford);
      entry.hasStableford = true;
    }
    if (Number.isFinite(r.playing_handicap ?? NaN)) {
      entry.playingHandicap = Number(r.playing_handicap);
    }
    if (r.format === 'stroke' || r.format === 'stableford') {
      entry.format = r.format;
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
    format?: ScoringFormat;
  },
): LeaderboardRow[] {
  const { hcpIndexByUser = {}, holesPlayedByUser = {}, format } = opts ?? {};
  const acc = aggregateScoreRows(rows);
  const out: LeaderboardRow[] = [];
  for (const [userId, agg] of acc) {
    const holes = Math.max(agg.holes, holesPlayedByUser[userId] ?? agg.holes);
    const gross = agg.gross;
    let netTotal = agg.net;
    let stablefordTotal: number | undefined = agg.hasStableford ? agg.stableford : undefined;
    if (!agg.netFromRows) {
      const fallbackHcp = hcpIndexByUser[userId] ?? 0;
      netTotal = computeNetSimple(gross, fallbackHcp, holes);
      const fallbackStableford = 2 * holes + gross - netTotal - agg.toPar;
      if (format === 'stableford' && stablefordTotal === undefined) {
        stablefordTotal = Math.max(0, Math.round(fallbackStableford));
      }
    }
    if (stablefordTotal === undefined && agg.hasStableford) {
      stablefordTotal = agg.stableford;
    }
    if (stablefordTotal === undefined && format === 'stableford') {
      const fallbackStableford = 2 * holes + gross - netTotal - agg.toPar;
      stablefordTotal = Math.max(0, Math.round(fallbackStableford));
    }
    const lastTs = agg.last?.iso ?? undefined;
    const formatForRow: ScoringFormat | undefined = format ?? agg.format;
    const hasStableford = Boolean(stablefordTotal !== undefined || agg.hasStableford || formatForRow === 'stableford');
    out.push({
      user_id: userId,
      display_name: nameByUser[userId] ?? 'Player',
      holes,
      gross,
      net: netTotal,
      toPar: agg.toPar,
      to_par: agg.toPar,
      last_ts: lastTs,
      stableford: stablefordTotal,
      hasStableford,
      playing_handicap: agg.playingHandicap !== null ? agg.playingHandicap : undefined,
      format: formatForRow,
    });
  }

  const formatSort: ScoringFormat | undefined = format;

  return out.sort((a, b) => cmpLeaderboard(a, b, formatSort));
}

function cmpLeaderboard(a: LeaderboardRow, b: LeaderboardRow, format?: ScoringFormat): number {
  const byRecency = () => {
    const at = a.last_ts ?? '';
    const bt = b.last_ts ?? '';
    if (at < bt) return 1;
    if (at > bt) return -1;
    return 0;
  };

  const finish = () => {
    const recencyOrder = byRecency();
    if (recencyOrder !== 0) {
      return recencyOrder;
    }
    return a.display_name.localeCompare(b.display_name);
  };

  const hasStablefordValue = (row: LeaderboardRow) => Number.isFinite(row.stableford ?? NaN);

  const wantStableford =
    format === 'stableford' ||
    (format === undefined && hasStablefordValue(a) && hasStablefordValue(b));

  if (wantStableford) {
    const pa = hasStablefordValue(a) ? Number(a.stableford) : Number.NEGATIVE_INFINITY;
    const pb = hasStablefordValue(b) ? Number(b.stableford) : Number.NEGATIVE_INFINITY;
    if (pa !== pb) {
      return pb - pa;
    }
    if (a.gross !== b.gross) {
      return a.gross - b.gross;
    }
    return finish();
  }

  const na = Number.isFinite(a.net ?? NaN) ? Number(a.net) : Number.POSITIVE_INFINITY;
  const nb = Number.isFinite(b.net ?? NaN) ? Number(b.net) : Number.POSITIVE_INFINITY;
  if (na !== nb) {
    return na - nb;
  }
  if (a.gross !== b.gross) {
    return a.gross - b.gross;
  }
  return finish();
}
