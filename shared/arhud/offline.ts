import { isBundleCached, listCachedBundleIds } from './bundle_client';

export async function listCachedCourseIds(): Promise<string[]> {
  return listCachedBundleIds();
}

export async function isCourseCached(id: string): Promise<boolean> {
  return isBundleCached(id);
}
