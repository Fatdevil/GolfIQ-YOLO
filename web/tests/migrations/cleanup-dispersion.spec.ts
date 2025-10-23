import { describe, it, expect } from 'vitest';
import { cleanupDispersionV1, KVStorage } from '../../../shared/caddie/migrations';

function memStore(seed: Record<string, string> = {}): KVStorage {
  const m = new Map(Object.entries(seed));
  return {
    async getItem(k) {
      return m.has(k) ? (m.get(k) as string) : null;
    },
    async setItem(k, v) {
      m.set(k, v);
    },
    async removeItem(k) {
      m.delete(k);
    },
  };
}

describe('cleanupDispersionV1', () => {
  it('removes v1 only when v2 exists and sets flag', async () => {
    const store = memStore({ 'caddie.dispersion.v1': 'old', 'caddie.dispersion.v2': 'new' });
    await cleanupDispersionV1({ storage: store });
    expect(await store.getItem('caddie.dispersion.v1')).toBeNull();
    expect(await store.getItem('caddie.migration.v1.cleanup.done')).toBe('1');
  });

  it('keeps v1 if v2 is missing', async () => {
    const store = memStore({ 'caddie.dispersion.v1': 'old' });
    await cleanupDispersionV1({ storage: store });
    expect(await store.getItem('caddie.dispersion.v1')).toBe('old');
    expect(await store.getItem('caddie.migration.v1.cleanup.done')).toBeNull();
  });
});
