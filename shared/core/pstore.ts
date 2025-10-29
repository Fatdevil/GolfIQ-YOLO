export type StorageValue = string;

interface StorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface GlobalWithNavigator {
  navigator?: { product?: string };
  localStorage?: {
    getItem?(key: string): string | null;
    setItem?(key: string, value: string): void;
    removeItem?(key: string): void;
  };
}

const memoryStore = (() => {
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
  } satisfies StorageBackend;
})();

let backendPromise: Promise<StorageBackend> | null = null;

function getGlobal(): GlobalWithNavigator {
  if (typeof globalThis === 'undefined') {
    return {};
  }
  return globalThis as GlobalWithNavigator;
}

function isReactNative(): boolean {
  const nav = getGlobal().navigator;
  const product = typeof nav?.product === 'string' ? nav.product : '';
  return product === 'ReactNative';
}

function createWebStorageBackend(): StorageBackend | null {
  const globalObject = getGlobal();
  const candidate = globalObject.localStorage;
  if (!candidate) {
    return null;
  }
  const getItem = typeof candidate.getItem === 'function' ? candidate.getItem.bind(candidate) : null;
  const setItem = typeof candidate.setItem === 'function' ? candidate.setItem.bind(candidate) : null;
  const removeItem = typeof candidate.removeItem === 'function' ? candidate.removeItem.bind(candidate) : null;
  if (!getItem || !setItem) {
    return null;
  }
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        setItem(key, value);
      } catch {
        // best effort only
      }
    },
    async removeItem(key: string): Promise<void> {
      if (!removeItem) {
        return;
      }
      try {
        removeItem(key);
      } catch {
        // ignore errors
      }
    },
  } satisfies StorageBackend;
}

async function resolveBackend(): Promise<StorageBackend> {
  if (backendPromise) {
    return backendPromise;
  }
  backendPromise = (async () => {
    if (isReactNative()) {
      try {
        const mod = await import('@react-native-async-storage/async-storage');
        const resolved = (mod && typeof mod === 'object' && 'default' in mod
          ? (mod as { default: StorageBackend }).default
          : (mod as unknown)) as Partial<StorageBackend> | undefined;
        if (
          resolved &&
          typeof resolved.getItem === 'function' &&
          typeof resolved.setItem === 'function'
        ) {
          return {
            async getItem(key: string): Promise<string | null> {
              try {
                return await resolved.getItem!(key);
              } catch {
                return null;
              }
            },
            async setItem(key: string, value: string): Promise<void> {
              try {
                await resolved.setItem!(key, value);
              } catch {
                // ignore persistence failures
              }
            },
            async removeItem(key: string): Promise<void> {
              if (typeof resolved.removeItem !== 'function') {
                return;
              }
              try {
                await resolved.removeItem(key);
              } catch {
                // ignore removal issues
              }
            },
          } satisfies StorageBackend;
        }
      } catch {
        // ignore dynamic import failure, fall back to web or memory
      }
    }

    const webBackend = createWebStorageBackend();
    if (webBackend) {
      return webBackend;
    }

    return memoryStore;
  })();
  return backendPromise;
}

export async function getItem(key: string): Promise<string | null> {
  const backend = await resolveBackend();
  return backend.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  const backend = await resolveBackend();
  await backend.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  const backend = await resolveBackend();
  await backend.removeItem(key);
}

export function __resetMemoryStoreForTests(): void {
  backendPromise = null;
}
