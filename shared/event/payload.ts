export type SharedRoundV1 = {
  v: 1;
  roundId: string;
  player: { id: string; name?: string; hcp?: number };
  courseId: string;
  holes: { start: number; end: number };
  gross: number;
  net?: number;
  sg?: number;
  holesBreakdown: Array<{ h: number; strokes: number; net?: number; sg?: number }>;
};

type PartialSharedRound = Partial<Omit<SharedRoundV1, 'player' | 'holesBreakdown'>> & {
  player?: Partial<SharedRoundV1['player']>;
  holesBreakdown?: unknown;
};

function clampHoleRange(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) {
    return fallback;
  }
  return Math.min(54, Math.max(1, rounded));
}

function sanitizePlayer(raw: unknown): SharedRoundV1['player'] {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const idRaw = source.id;
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `player-${Date.now()}`;
  const nameRaw = source.name;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined;
  const hcpRaw = Number((source as { hcp?: unknown }).hcp);
  const hcp = Number.isFinite(hcpRaw) ? hcpRaw : undefined;
  return { id, name, hcp };
}

function sanitizeHole(entry: unknown): { h: number; strokes: number; net?: number; sg?: number } | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const hRaw = Number(record.h);
  const strokesRaw = Number(record.strokes);
  if (!Number.isFinite(hRaw) || !Number.isFinite(strokesRaw)) {
    return null;
  }
  const holeNo = Math.max(1, Math.floor(hRaw));
  const strokes = Math.max(0, Math.round(strokesRaw));
  const result: { h: number; strokes: number; net?: number; sg?: number } = { h: holeNo, strokes };
  const netRaw = Number(record.net);
  if (Number.isFinite(netRaw)) {
    result.net = Number(netRaw);
  }
  const sgRaw = Number(record.sg);
  if (Number.isFinite(sgRaw)) {
    result.sg = Number(sgRaw);
  }
  return result;
}

function sanitizeHolesBreakdown(input: unknown): SharedRoundV1['holesBreakdown'] {
  if (!Array.isArray(input)) {
    return [];
  }
  const rows: SharedRoundV1['holesBreakdown'] = [];
  for (const raw of input) {
    const normalized = sanitizeHole(raw);
    if (normalized) {
      rows.push(normalized);
    }
    if (rows.length >= 36) {
      break;
    }
  }
  rows.sort((a, b) => a.h - b.h);
  return rows;
}

function sanitizeSharedRound(raw: unknown): SharedRoundV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid shared round payload');
  }
  const source = raw as PartialSharedRound & { v?: unknown };
  const version = Number(source.v);
  if (version !== 1) {
    throw new Error('Unsupported shared round version');
  }
  const roundIdRaw = (source as { roundId?: unknown }).roundId;
  const roundId = typeof roundIdRaw === 'string' && roundIdRaw.trim() ? roundIdRaw.trim() : null;
  if (!roundId) {
    throw new Error('Shared round missing roundId');
  }
  const courseRaw = (source as { courseId?: unknown }).courseId;
  const courseId = typeof courseRaw === 'string' && courseRaw.trim() ? courseRaw.trim() : null;
  if (!courseId) {
    throw new Error('Shared round missing courseId');
  }
  const holesRaw = source.holes && typeof source.holes === 'object' ? source.holes : {};
  const start = clampHoleRange(Number((holesRaw as { start?: unknown }).start), 1);
  const endCandidate = clampHoleRange(Number((holesRaw as { end?: unknown }).end), start + 8);
  const end = Math.max(start, endCandidate);
  const grossRaw = Number((source as { gross?: unknown }).gross);
  if (!Number.isFinite(grossRaw)) {
    throw new Error('Shared round missing gross score');
  }
  const netRaw = Number((source as { net?: unknown }).net);
  const sgRaw = Number((source as { sg?: unknown }).sg);
  const player = sanitizePlayer(source.player);
  const holesBreakdown = sanitizeHolesBreakdown(source.holesBreakdown);
  const payload: SharedRoundV1 = {
    v: 1,
    roundId,
    player,
    courseId,
    holes: { start, end },
    gross: Number(grossRaw),
    holesBreakdown,
  };
  if (Number.isFinite(netRaw)) {
    payload.net = Number(netRaw);
  }
  if (Number.isFinite(sgRaw)) {
    payload.sg = Number(sgRaw);
  }
  return payload;
}

function encodeToUriComponent(data: SharedRoundV1): string {
  const serialized = JSON.stringify(data);
  return encodeURIComponent(serialized);
}

function tryParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function encodeSharedRoundV1(input: SharedRoundV1): string {
  const normalized = sanitizeSharedRound(input);
  return encodeToUriComponent(normalized);
}

export function decodeSharedRoundV1(raw: string): SharedRoundV1 {
  if (typeof raw !== 'string') {
    throw new Error('Shared round payload must be a string');
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Shared round payload empty');
  }
  const directCandidate = tryParseJson(trimmed);
  if (directCandidate) {
    return sanitizeSharedRound(directCandidate);
  }
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // fallthrough: attempt JSON parse on raw string
  }
  const parsed = tryParseJson(decoded);
  if (!parsed) {
    throw new Error('Unable to parse shared round payload');
  }
  return sanitizeSharedRound(parsed);
}

