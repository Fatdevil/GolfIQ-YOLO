import type { WatchHUDStateV1 } from './types';

const STRATEGY_PROFILES = new Set<WatchHUDStateV1['strategy'] extends infer T
  ? T extends { profile: infer P }
    ? P
    : never
  : never>(['conservative', 'neutral', 'aggressive']);

const getBuffer = (): ((...args: unknown[]) => any) | null => {
  const globalBuffer = (globalThis as { Buffer?: { from: (...args: unknown[]) => any } }).Buffer;
  return globalBuffer?.from ? globalBuffer.from.bind(globalBuffer) : null;
};

const TEXT_ENCODER: TextEncoder | null =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TEXT_DECODER: TextDecoder | null =
  typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;

const bufferFrom = getBuffer();

type StrategyProfile = NonNullable<WatchHUDStateV1['strategy']>['profile'];

const isStrategyProfile = (value: unknown): value is StrategyProfile =>
  typeof value === 'string' && STRATEGY_PROFILES.has(value as StrategyProfile);

const encodeUtf8 = (value: string): Uint8Array => {
  if (TEXT_ENCODER) {
    return TEXT_ENCODER.encode(value);
  }
  if (bufferFrom) {
    return new Uint8Array(bufferFrom(value, 'utf8'));
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
};

const decodeUtf8 = (value: Uint8Array): string => {
  if (TEXT_DECODER) {
    return TEXT_DECODER.decode(value);
  }
  if (bufferFrom) {
    return bufferFrom(value).toString('utf8');
  }
  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    result += String.fromCharCode(value[i]);
  }
  return result;
};

const expectFiniteNumber = (input: unknown, field: string): number => {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${field}`);
  }
  return numeric;
};

const sanitizeStrategy = (
  raw: unknown,
): WatchHUDStateV1['strategy'] | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const profile = record.profile;
  if (!isStrategyProfile(profile)) {
    return undefined;
  }
  const offset = expectFiniteNumber(record.offset_m, 'strategy.offset_m');
  const carry = expectFiniteNumber(record.carry_m, 'strategy.carry_m');
  return {
    profile,
    offset_m: offset,
    carry_m: carry,
  };
};

export function encodeHUD(state: WatchHUDStateV1): Uint8Array {
  const canonical: WatchHUDStateV1 = {
    v: 1,
    ts: expectFiniteNumber(state.ts, 'ts'),
    fmb: {
      front: expectFiniteNumber(state.fmb.front, 'fmb.front'),
      middle: expectFiniteNumber(state.fmb.middle, 'fmb.middle'),
      back: expectFiniteNumber(state.fmb.back, 'fmb.back'),
    },
    playsLikePct: expectFiniteNumber(state.playsLikePct, 'playsLikePct'),
    wind: {
      mps: expectFiniteNumber(state.wind.mps, 'wind.mps'),
      deg: expectFiniteNumber(state.wind.deg, 'wind.deg'),
    },
    tournamentSafe: state.tournamentSafe === true,
  };
  if (state.strategy) {
    const normalized = sanitizeStrategy(state.strategy);
    if (normalized) {
      canonical.strategy = normalized;
    }
  }
  const json = JSON.stringify(canonical);
  return encodeUtf8(json);
}

export function decodeHUD(buffer: Uint8Array): WatchHUDStateV1 {
  const text = decodeUtf8(buffer);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid HUD payload');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid HUD payload');
  }
  const record = parsed as Record<string, unknown>;
  const version = record.v;
  if (version !== 1) {
    throw new Error(`Unsupported HUD payload version: ${String(version)}`);
  }
  const fmbRaw = record.fmb;
  if (!fmbRaw || typeof fmbRaw !== 'object') {
    throw new Error('Invalid HUD payload: missing fmb');
  }
  const fmbRecord = fmbRaw as Record<string, unknown>;
  const strategy = sanitizeStrategy(record.strategy);
  return {
    v: 1,
    ts: expectFiniteNumber(record.ts, 'ts'),
    fmb: {
      front: expectFiniteNumber(fmbRecord.front, 'fmb.front'),
      middle: expectFiniteNumber(fmbRecord.middle, 'fmb.middle'),
      back: expectFiniteNumber(fmbRecord.back, 'fmb.back'),
    },
    playsLikePct: expectFiniteNumber(record.playsLikePct, 'playsLikePct'),
    wind: {
      mps: expectFiniteNumber((record.wind as Record<string, unknown> | undefined)?.mps, 'wind.mps'),
      deg: expectFiniteNumber((record.wind as Record<string, unknown> | undefined)?.deg, 'wind.deg'),
    },
    ...(strategy ? { strategy } : {}),
    tournamentSafe: record.tournamentSafe === true,
  };
}
