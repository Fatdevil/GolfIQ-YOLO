type NumericLike = number | string | null | undefined;

export type RawSpectatorRow = {
  name?: string | null;
  display_name?: string | null;
  gross?: NumericLike;
  net?: NumericLike;
  thru?: NumericLike;
  holes?: NumericLike;
  holes_played?: NumericLike;
  hole?: NumericLike;
  current_hole?: NumericLike;
  status?: string | null;
  last_under_par_at?: string | null;
  under_par_at?: string | null;
  finished_at?: string | null;
  completed_at?: string | null;
  updated_at?: NumericLike;
  last_updated?: NumericLike;
  ts?: NumericLike;
  [key: string]: unknown;
};

export type SpectatorPlayer = {
  name: string;
  gross: number;
  net?: number;
  thru: number;
  hole: number;
  status?: string;
};

export type SpectatorBoard = {
  players: SpectatorPlayer[];
  updatedAt: string | null;
};

function toNumber(value: NumericLike): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: NumericLike): number | null {
  const num = toNumber(value);
  if (num === null) {
    return null;
  }
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.trunc(num);
}

function normalizeName(row: RawSpectatorRow): string {
  const candidate = row.name ?? row.display_name ?? 'Player';
  const trimmed = typeof candidate === 'string' ? candidate.trim() : `${candidate ?? 'Player'}`;
  return trimmed || 'Player';
}

function pickStatus(row: RawSpectatorRow): string | null {
  const candidate = row.status;
  if (candidate == null) {
    return null;
  }
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

export function sanitizeSpectatorRow(row: RawSpectatorRow): SpectatorPlayer {
  const name = normalizeName(row);
  const gross = toInt(row.gross) ?? 0;
  const net = toNumber(row.net);
  const thru = toInt(row.thru ?? row.holes ?? row.holes_played) ?? 0;
  const hole = toInt(row.hole ?? row.current_hole ?? thru) ?? 0;
  const status = pickStatus(row);
  return { name, gross, net: net ?? undefined, thru, hole, status: status ?? undefined };
}

function parseTimestamp(value: NumericLike | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    // assume milliseconds when value is large
    return value > 1e12 ? value / 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.endsWith('Z') ? `${trimmed.slice(0, -1)}+00:00` : trimmed;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? timestamp / 1000 : null;
  }
  return null;
}

function formatIso(ts: number | null): string | null {
  if (ts == null || !Number.isFinite(ts)) {
    return null;
  }
  return new Date(ts * 1000).toISOString();
}

function extractMeta(row: RawSpectatorRow) {
  return {
    lastUnderPar: row.last_under_par_at ?? row.under_par_at ?? null,
    finishedAt: row.finished_at ?? row.completed_at ?? null,
    updatedAt: row.updated_at ?? row.last_updated ?? row.ts ?? null,
  } as const;
}

type SortMode = 'net' | 'gross';

function buildSortKey(
  player: SpectatorPlayer,
  row: RawSpectatorRow,
  mode: SortMode,
): [number, number, number, number, string] {
  const netValue = player.net ?? Number.POSITIVE_INFINITY;
  const grossValue = Number.isFinite(player.gross) ? player.gross : Number.POSITIVE_INFINITY;
  const meta = extractMeta(row);
  const lastUnderPar = parseTimestamp(meta.lastUnderPar);
  const finished = parseTimestamp(meta.finishedAt);
  if (mode === 'gross') {
    return [
      grossValue,
      netValue,
      lastUnderPar ?? Number.POSITIVE_INFINITY,
      finished ?? Number.POSITIVE_INFINITY,
      player.name.toLowerCase(),
    ];
  }
  return [
    netValue,
    grossValue,
    lastUnderPar ?? Number.POSITIVE_INFINITY,
    finished ?? Number.POSITIVE_INFINITY,
    player.name.toLowerCase(),
  ];
}

export function buildSpectatorBoard(
  rows: RawSpectatorRow[],
  options?: { mode?: SortMode },
): SpectatorBoard {
  const mode: SortMode = options?.mode === 'gross' ? 'gross' : 'net';
  const enriched = rows.map((row) => {
    const player = sanitizeSpectatorRow(row);
    return { player, sort: buildSortKey(player, row, mode), row };
  });

  enriched.sort((a, b) => {
    for (let i = 0; i < a.sort.length; i += 1) {
      const av = a.sort[i]!;
      const bv = b.sort[i]!;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });

  const players = enriched.map((entry) => entry.player);
  const latestTs = enriched
    .map((entry) => parseTimestamp(extractMeta(entry.row).updatedAt))
    .filter((ts): ts is number => ts != null)
    .reduce<number | null>((acc, ts) => {
      if (!Number.isFinite(ts)) {
        return acc;
      }
      if (acc == null || ts > acc) {
        return ts;
      }
      return acc;
    }, null);

  return { players, updatedAt: formatIso(latestTs) };
}
