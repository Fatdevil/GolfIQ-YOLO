import type { TargetBingoConfig, TargetBingoResult } from "./games";

export type GhostProfileId = string;

export interface GhostProfile {
  id: GhostProfileId;
  createdAt: number;
  name: string;
  config: TargetBingoConfig;
  result: {
    totalShots: number;
    hits: number;
    hitRate_pct: number;
    avgAbsError_m: number | null;
  };
}

const STORAGE_KEY = "golfiq.range.ghosts.v1";
const STORAGE_LIMIT = 10;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (err) {
    console.warn("Ghost storage unavailable", err);
    return null;
  }
}

function readRaw(): GhostProfile[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Ghost storage malformed");
    }

    return parsed
      .filter((item): item is GhostProfile =>
        item != null && typeof item === "object" && typeof (item as GhostProfile).id === "string"
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn("Failed to parse ghost profiles", err);
    storage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function listGhosts(): GhostProfile[] {
  return readRaw();
}

export function saveGhost(profile: GhostProfile): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const existing = readRaw().filter((item) => item.id !== profile.id);
  const next = [profile, ...existing].slice(0, STORAGE_LIMIT);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function deleteGhost(id: GhostProfileId): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const remaining = readRaw().filter((item) => item.id !== id);
  storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}

export function getLatestGhost(): GhostProfile | null {
  const ghosts = readRaw();
  return ghosts.length > 0 ? ghosts[0] : null;
}

export function createGhostId(): GhostProfileId {
  return `ghost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeGhostProfileFromResult(
  cfg: TargetBingoConfig,
  result: TargetBingoResult,
  name: string
): GhostProfile {
  return {
    id: createGhostId(),
    createdAt: Date.now(),
    name,
    config: cfg,
    result: {
      totalShots: result.totalShots,
      hits: result.hits,
      hitRate_pct: result.hitRate_pct,
      avgAbsError_m: result.avgAbsError_m,
    },
  };
}
