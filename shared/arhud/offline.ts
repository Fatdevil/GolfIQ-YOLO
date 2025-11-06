import { isBundleCached, listCachedBundleIds, removeCachedBundle } from './bundle_client';

export async function listCachedCourseIds(): Promise<string[]> {
  const ids = await listCachedBundleIds();
  if (!ids.length) {
    return [];
  }
  const results = await Promise.all(
    ids.map(async (id) => ({ id, cached: await isBundleCached(id) })),
  );
  return results
    .filter((entry) => entry.cached)
    .map((entry) => entry.id);
}

export async function isCourseCached(id: string): Promise<boolean> {
  if (!id) {
    return false;
  }
  return isBundleCached(id);
}

export async function removeCachedCourse(id: string): Promise<void> {
  if (!id) {
    return;
  }
  await removeCachedBundle(id);
}
