import { getItem, removeItem, setItem } from '../core/pstore';
import type { BagStats, ClubId, ClubStats } from './types';

const STORAGE_KEY = 'bag:v1';

type JsonValue = Record<string, unknown>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStoredClubStats(value: unknown): value is ClubStats {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as JsonValue;
  if (typeof record.club !== 'string') {
    return false;
  }
  if (!Number.isFinite(Number(record.samples))) {
    return false;
  }
  return true;
}

function hydrateBagStats(input: unknown): BagStats | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as JsonValue;
  const updatedAtRaw = record.updatedAt;
  if (!isFiniteNumber(updatedAtRaw)) {
    return null;
  }
  const clubsInput = record.clubs;
  if (!clubsInput || typeof clubsInput !== 'object') {
    return null;
  }
  const clubs: Partial<Record<ClubId, ClubStats>> = {};
  for (const [key, value] of Object.entries(clubsInput as Record<string, unknown>)) {
    if (!isStoredClubStats(value)) {
      continue;
    }
    const stats = value as ClubStats;
    clubs[key as ClubId] = {
      club: stats.club as ClubId,
      samples: Number(stats.samples) ?? 0,
      meanCarry_m: isFiniteNumber(stats.meanCarry_m) ? stats.meanCarry_m : null,
      p25_m: isFiniteNumber(stats.p25_m) ? stats.p25_m : null,
      p50_m: isFiniteNumber(stats.p50_m) ? stats.p50_m : null,
      p75_m: isFiniteNumber(stats.p75_m) ? stats.p75_m : null,
      std_m: isFiniteNumber(stats.std_m) ? stats.std_m : null,
      sgPerShot: isFiniteNumber(stats.sgPerShot) ? stats.sgPerShot : null,
    };
  }
  return { updatedAt: Number(updatedAtRaw), clubs } satisfies BagStats;
}

export async function loadBagStats(): Promise<BagStats | null> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return hydrateBagStats(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveBagStats(stats: BagStats | null): Promise<void> {
  if (!stats) {
    await removeItem(STORAGE_KEY);
    return;
  }
  await setItem(STORAGE_KEY, JSON.stringify(stats));
}

export async function updateBagStats(mutator: (prev: BagStats | null) => BagStats | null): Promise<BagStats | null> {
  const current = await loadBagStats();
  const next = mutator(current);
  await saveBagStats(next);
  return next;
}

export function __hydrateBagStatsForTests(payload: unknown): BagStats | null {
  return hydrateBagStats(payload);
}
