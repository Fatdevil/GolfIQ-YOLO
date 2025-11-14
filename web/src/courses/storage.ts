import type { CourseBundle } from "./types";

const STORAGE_KEY = "golfiq.courseBundles.v1";

type BundleCache = Record<string, CourseBundle>;

type GlobalWithStorage = typeof globalThis & { localStorage?: Storage };

function getStorage(): Storage | null {
  const globalWithStorage = globalThis as GlobalWithStorage;
  return globalWithStorage.localStorage ?? null;
}

export function loadBundleFromCache(courseId: string): CourseBundle | null {
  if (!courseId) {
    return null;
  }
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as BundleCache | null;
    if (!cache || typeof cache !== "object") {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    const bundle = cache[courseId];
    return bundle ?? null;
  } catch (err) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveBundleToCache(bundle: CourseBundle): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  let cache: BundleCache = {};
  const raw = storage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as BundleCache | null;
      if (parsed && typeof parsed === "object") {
        cache = parsed;
      }
    } catch (err) {
      storage.removeItem(STORAGE_KEY);
      cache = {};
    }
  }
  cache[bundle.id] = bundle;
  storage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export const __testing = {
  STORAGE_KEY,
};
