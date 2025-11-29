import AsyncStorage from '@react-native-async-storage/async-storage';

export type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memory = new Map<string, string>();

function createNativeStorage(): AsyncStorageLike {
  return {
    async getItem(key: string) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value != null) return value;
      } catch {
        // fall back to memory
      }
      return memory.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      memory.set(key, value);
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        // ignore persistent failures but keep memory copy
      }
    },
    async removeItem(key: string) {
      memory.delete(key);
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

function createMemoryStorage(): AsyncStorageLike {
  return {
    async getItem(key: string) {
      return memory.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      memory.set(key, value);
    },
    async removeItem(key: string) {
      memory.delete(key);
    },
  };
}

function resolveStorage(): AsyncStorageLike {
  if (typeof AsyncStorage !== 'undefined') {
    return createNativeStorage();
  }
  return createMemoryStorage();
}

const storage = resolveStorage();

export async function getItem(key: string): Promise<string | null> {
  try {
    const value = await storage.getItem(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await storage.setItem(key, value);
  } catch {
    // ignore
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await storage.removeItem(key);
  } catch {
    // ignore
  }
}
