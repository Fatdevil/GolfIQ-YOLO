import {
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
  listCachedBundleIds,
  removeCachedBundle,
} from './bundle_client';
import { isCourseCached } from './offline';

export type PrefetchPlan = { courseIds: string[]; ttlSec?: number };
export type PrefetchReport = { downloaded: string[]; skipped: string[]; failed: string[] };

type PlanOptions = {
  lastCourseId?: string | null;
  nearby: Array<{ courseId: string; dist_km: number }>;
  maxCourses?: number;
};

const DEFAULT_MAX_COURSES = 3;

function sanitizeCourseId(id: string): string {
  return typeof id === 'string' ? id.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
}

export async function planPrefetch(opts: PlanOptions): Promise<PrefetchPlan> {
  const { lastCourseId, nearby, maxCourses = DEFAULT_MAX_COURSES } = opts;
  const limit = Number.isFinite(maxCourses) && maxCourses! > 0 ? Math.floor(maxCourses!) : DEFAULT_MAX_COURSES;
  const index = await getIndex();
  const available = new Set(index.map((entry) => entry.courseId));
  const ordered: string[] = [];
  const pushUnique = (id: string | null | undefined) => {
    if (!id) {
      return;
    }
    const normalized = sanitizeCourseId(id);
    if (!normalized || ordered.includes(normalized) || !available.has(normalized)) {
      return;
    }
    ordered.push(normalized);
  };

  pushUnique(lastCourseId ?? null);

  const sortedNearby = [...(nearby ?? [])].sort((a, b) => {
    const distA = Number.isFinite(a?.dist_km) ? Number(a.dist_km) : Number.POSITIVE_INFINITY;
    const distB = Number.isFinite(b?.dist_km) ? Number(b.dist_km) : Number.POSITIVE_INFINITY;
    return distA - distB;
  });

  for (const candidate of sortedNearby) {
    pushUnique(candidate?.courseId);
    if (ordered.length >= limit) {
      break;
    }
  }

  const courseIds = ordered.slice(0, limit);
  return { courseIds, ttlSec: undefined };
}

export async function runPrefetch(plan: PrefetchPlan): Promise<PrefetchReport> {
  const downloaded: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const id of plan.courseIds ?? []) {
    const normalized = sanitizeCourseId(id);
    if (!normalized) {
      continue;
    }
    const start = Date.now();
    try {
      const cached = await isCourseCached(normalized);
      await getBundle(normalized);
      const meta = getLastBundleFetchMeta(normalized);
      const freshDownload = Boolean(meta && meta.timestamp >= start && meta.fromCache === false);
      if (freshDownload || !cached) {
        downloaded.push(normalized);
      } else {
        skipped.push(normalized);
      }
    } catch (error) {
      failed.push(normalized);
    }
  }
  return {
    downloaded,
    skipped,
    failed,
  };
}

export async function pruneBundles(keepIds: string[]): Promise<string[]> {
  const keep = new Set((keepIds ?? []).map((id) => sanitizeCourseId(id)).filter((id) => !!id));
  const cached = await listCachedBundleIds();
  const removed: string[] = [];
  for (const id of cached) {
    if (!keep.has(id)) {
      await removeCachedBundle(id);
      removed.push(id);
    }
  }
  return removed;
}
