export interface LayupTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  hazardDistanceMeters?: number | null;
}

export interface CachedHole {
  holeId: string;
  pin: { lat: number; lon: number };
  layups: LayupTarget[];
  lastSyncedAt: string;
  caddieRecommendation?: Record<string, unknown>;
}

export class CachedHoleStore {
  private cache = new Map<string, CachedHole>();

  set(hole: CachedHole): void {
    this.cache.set(hole.holeId, hole);
  }

  get(holeId: string): CachedHole | undefined {
    return this.cache.get(holeId);
  }

  clearStale(thresholdHours: number): void {
    const cutoff = Date.now() - thresholdHours * 60 * 60 * 1000;
    for (const [key, value] of this.cache.entries()) {
      const timestamp = Date.parse(value.lastSyncedAt);
      if (!Number.isNaN(timestamp) && timestamp < cutoff) {
        this.cache.delete(key);
      }
    }
  }
}