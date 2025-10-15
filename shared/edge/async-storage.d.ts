declare module '@react-native-async-storage/async-storage' {
  export interface AsyncStorageLike {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem?(key: string): Promise<void>;
  }

  const AsyncStorage: AsyncStorageLike;
  export default AsyncStorage;
}
