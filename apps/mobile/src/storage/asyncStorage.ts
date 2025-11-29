export type AsyncStorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const memory = new Map<string, string>();

function resolveStorage(): AsyncStorageLike | null {
  const globalAny = globalThis as unknown as { localStorage?: Storage };
  if (globalAny.localStorage) {
    return globalAny.localStorage;
  }
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  } satisfies AsyncStorageLike;
}

const storage = resolveStorage();

export async function getItem(key: string): Promise<string | null> {
  if (!storage) return null;
  try {
    const value = await storage.getItem(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (!storage) return;
  try {
    await storage.setItem(key, value);
  } catch {
    // ignore
  }
}

export async function removeItem(key: string): Promise<void> {
  if (!storage) return;
  try {
    await storage.removeItem(key);
  } catch {
    // ignore
  }
}
