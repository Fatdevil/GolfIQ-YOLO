import { beforeEach, describe, expect, it } from 'vitest';

import { BundleStore } from '../../../shared/bundles/store';
import { __resetMemoryStoreForTests } from '../../../shared/core/pstore';

function makeBytes(length: number, start = 0): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = (start + i) % 256;
  }
  return bytes;
}

describe('BundleStore', () => {
  beforeEach(() => {
    __resetMemoryStoreForTests();
  });

  it('stores and retrieves bundles', async () => {
    const store = new BundleStore({ maxBytes: 1024, highWatermark: 512 });
    const key = 'course:demo:v:1';
    const payload = makeBytes(16);
    await store.set(key, payload, payload.byteLength);
    const loaded = await store.get(key);
    expect(loaded).toEqual(payload);
    const stat = await store.stat(key);
    expect(stat).toEqual({ bytes: payload.byteLength });
  });

  it('evicts least recently used entries when exceeding the high watermark', async () => {
    const store = new BundleStore({ maxBytes: 16, highWatermark: 12 });
    await store.set('a', makeBytes(4, 1), 4);
    await store.set('b', makeBytes(4, 2), 4);
    await store.set('c', makeBytes(2, 3), 2);
    expect(await store.get('a')).toBeDefined();
    // Touch b to make it most recently used
    await store.get('b');
    // Adding another entry should evict the oldest (c)
    await store.set('d', makeBytes(4, 4), 4);
    expect(await store.get('c')).toBeUndefined();
    expect(await store.get('a')).toBeDefined();
    expect(await store.get('b')).toBeDefined();
    expect(await store.get('d')).toBeDefined();
  });

  it('drops oversized bundles that exceed the configured maximum', async () => {
    const store = new BundleStore({ maxBytes: 8, highWatermark: 6 });
    const large = makeBytes(16, 9);
    await store.set('oversized', large, large.byteLength);
    expect(await store.get('oversized')).toBeUndefined();
  });

  it('supports explicit deletion', async () => {
    const store = new BundleStore({ maxBytes: 32, highWatermark: 24 });
    await store.set('alpha', makeBytes(4, 11), 4);
    await store.del('alpha');
    expect(await store.get('alpha')).toBeUndefined();
    expect(await store.stat('alpha')).toBeUndefined();
  });
});
