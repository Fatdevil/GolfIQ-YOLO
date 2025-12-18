const storage = new Map<string, string | null>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return storage.has(key) ? storage.get(key) ?? null : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    storage.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    storage.delete(key);
  },
  async clear(): Promise<void> {
    storage.clear();
  },
};

export default AsyncStorage;
