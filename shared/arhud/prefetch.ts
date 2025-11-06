import {
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
  isBundleCached,
  listCachedBundleIds,
  overrideBundleTtl,
  removeCachedBundle,
} from './bundle_client';

export type PrefetchPlan = { courseIds: string[]; ttlSec?: number };
export type PrefetchReport = { downloaded: string[]; skipped: string[]; failed: string[] };

type PlanOptions = {
  lastCourseId?: string | null;
  nearby: Array<{ courseId: string; dist_km: number }>;
  maxCourses?: number;
};

function normalizeCourseId(id: string | null | undefined): string | null {
  if (!id || typeof id !== 'string') {
    return null;
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function clampMaxCourses(maxCourses: number | undefined): number {
  if (!Number.isFinite(maxCourses ?? Number.NaN)) {
    return 3;
  }
  const value = Math.floor(Number(maxCourses));
  if (value <= 0) {
    return 1;
  }
  return Math.min(value, 8);
}

export async function planPrefetch(options: PlanOptions): Promise<PrefetchPlan> {
  const maxCourses = clampMaxCourses(options?.maxCourses);
  const safeNearby = Array.isArray(options?.nearby) ? [...options.nearby] : [];
  safeNearby.sort((a, b) => {
    const distA = Number.isFinite(a?.dist_km) ? Number(a.dist_km) : Number.POSITIVE_INFINITY;
    const distB = Number.isFinite(b?.dist_km) ? Number(b.dist_km) : Number.POSITIVE_INFINITY;
    return distA - distB;
  });

  let indexIds: Set<string> = new Set();
  try {
    const index = await getIndex();
    indexIds = new Set(index.map((entry) => entry.courseId));
  } catch (error) {
    // Fall back to trusting the caller-provided course ids when index fetch fails.
    indexIds = new Set(safeNearby.map((entry) => entry.courseId));
    const normalizedLast = normalizeCourseId(options?.lastCourseId);
    if (normalizedLast) {
      indexIds.add(normalizedLast);
    }
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  const tryAdd = (courseId: string | null) => {
    if (!courseId) {
      return;
    }
    const normalized = normalizeCourseId(courseId);
    if (!normalized) {
      return;
    }
    if (seen.has(normalized)) {
      return;
    }
    if (indexIds.size && !indexIds.has(courseId) && !indexIds.has(normalized)) {
      return;
    }
    seen.add(normalized);
    selected.push(courseId);
  };

  const lastCourseId = options?.lastCourseId;
  if (lastCourseId) {
    tryAdd(lastCourseId);
  }

  for (const candidate of safeNearby) {
    if (selected.length >= maxCourses) {
      break;
    }
    tryAdd(candidate?.courseId ?? null);
  }

  if (selected.length > maxCourses) {
    selected.length = maxCourses;
  }

  return { courseIds: selected };
}

export async function runPrefetch(plan: PrefetchPlan): Promise<PrefetchReport> {
  const downloaded: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();
  const ttlOverride = plan?.ttlSec;

  for (const rawId of plan?.courseIds ?? []) {
    if (typeof rawId !== 'string' || !rawId) {
      continue;
    }
    const normalized = normalizeCourseId(rawId);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const cachedBefore = await isBundleCached(rawId);
    try {
      await getBundle(rawId);
      if (Number.isFinite(ttlOverride ?? Number.NaN) && ttlOverride && ttlOverride > 0) {
        await overrideBundleTtl(rawId, ttlOverride);
      }
      const meta = getLastBundleFetchMeta(rawId);
      const fetchedFromNetwork = meta ? !meta.fromCache : !cachedBefore;
      if (fetchedFromNetwork) {
        downloaded.push(rawId);
      } else {
        skipped.push(rawId);
      }
    } catch (error) {
      failed.push(rawId);
    }
  }

  return { downloaded, skipped, failed };
}

export async function pruneBundles(keepIds: string[]): Promise<string[]> {
  const keep = new Set<string>();
  for (const id of keepIds ?? []) {
    const normalized = normalizeCourseId(id);
    if (normalized) {
      keep.add(normalized);
    }
  }

  const cached = await listCachedBundleIds();
  const removed: string[] = [];
  for (const id of cached) {
    const normalized = normalizeCourseId(id);
    if (!normalized) {
      continue;
    }
    if (keep.has(normalized)) {
      continue;
    }
    try {
      await removeCachedBundle(id);
      removed.push(id);
    } catch (error) {
      // keep best-effort behaviour; failures are ignored so that other bundles can be pruned
    }
  }
  return removed;
}
