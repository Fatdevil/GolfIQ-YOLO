// Small, testable migration helper
export interface KVStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, val: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const V1_KEY = 'caddie.dispersion.v1';
const V2_KEY = 'caddie.dispersion.v2';
const FLAG_KEY = 'caddie.migration.v1.cleanup.done';

export async function cleanupDispersionV1(opts?: { storage?: KVStorage; log?: (m: string) => void }) {
  const log = opts?.log ?? (() => {});
  // Try to resolve an AsyncStorage implementation if caller didn’t inject one.
  let storage: KVStorage;
  if (opts?.storage) {
    storage = opts.storage;
  } else {
    // Lazy import to avoid breaking web tests; caller can inject a mock there.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const getItem = AsyncStorage?.getItem?.bind(AsyncStorage);
    const setItem = AsyncStorage?.setItem?.bind(AsyncStorage);
    const removeItem = AsyncStorage?.removeItem?.bind(AsyncStorage);
    storage = {
      getItem: (k) => (getItem ? getItem(k) : Promise.resolve(null)),
      setItem: (k, v) => (setItem ? setItem(k, v) : Promise.resolve()),
      removeItem: (k) => (removeItem ? removeItem(k) : Promise.resolve()),
    };
  }

  try {
    // Idempotent guard
    const already = await storage.getItem(FLAG_KEY);
    if (already === '1') return;

    const v2 = await storage.getItem(V2_KEY);
    if (v2) {
      const v1 = await storage.getItem(V1_KEY);
      if (v1) {
        await storage.removeItem(V1_KEY);
        log('[migration] removed legacy caddie.dispersion.v1');
      }
      await storage.setItem(FLAG_KEY, '1');
    } else {
      log('[migration] v2 not present; leaving v1 intact');
    }
  } catch (e) {
    log(`[migration] cleanup error: ${(e as Error).message}`);
    // non-fatal by design
  }
}
