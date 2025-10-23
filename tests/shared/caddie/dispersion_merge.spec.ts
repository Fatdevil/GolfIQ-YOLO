import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setDispersionStorageForTests,
  loadLearnedDispersion,
  saveLearnedDispersion,
  saveMergedDispersion,
  type ClubDispersion,
} from '../../../shared/caddie/player_model';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

describe('saveMergedDispersion', () => {
  beforeEach(() => {
    __setDispersionStorageForTests(createMemoryStorage());
  });

  afterEach(() => {
    __setDispersionStorageForTests(null);
  });

  it('preserves unknown clubs, merges overlaps with weighted sigma, and accumulates n', async () => {
    const base: Record<string, ClubDispersion> = {
      '7i': { sigma_long_m: 10, sigma_lat_m: 8, n: 20, updatedAt: 1 },
      PW: { sigma_long_m: 7, sigma_lat_m: 6, n: 15, updatedAt: 1 },
    };

    await saveLearnedDispersion(base as any, 1);

    const incoming: Record<string, ClubDispersion> = {
      '7i': { sigma_long_m: 8, sigma_lat_m: 9, n: 10 },
      '6i': { sigma_long_m: 11, sigma_lat_m: 9, n: 8 },
    };

    await saveMergedDispersion(incoming as any, 123);

    const snapshot = await loadLearnedDispersion();
    expect(snapshot).not.toBeNull();
    const persisted = snapshot!.clubs as Record<string, ClubDispersion>;

    expect(persisted.PW).toBeDefined();
    expect(persisted.PW?.sigma_long_m).toBeCloseTo(7, 5);
    expect(persisted.PW?.n).toBe(15);

    expect(persisted['7i']).toBeDefined();
    expect(persisted['7i']?.n).toBe(30);
    expect(persisted['7i']?.sigma_long_m).toBeGreaterThan(8);
    expect(persisted['7i']?.sigma_long_m).toBeLessThan(10);
    expect(persisted['7i']?.sigma_lat_m).toBeGreaterThan(8);
    expect(persisted['7i']?.sigma_lat_m).toBeLessThan(9);
    expect(persisted['7i']?.updatedAt).toBe(123);

    expect(persisted['6i']).toBeDefined();
    expect(persisted['6i']?.n).toBe(8);
    expect(persisted['6i']?.sigma_lat_m).toBeCloseTo(9, 5);
    expect(persisted['6i']?.updatedAt).toBe(123);
  });
});
