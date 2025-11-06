import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetBundleClientForTests,
  __setBundleCacheBackendForTests,
  getLastBundleFetchMeta,
  listCachedBundleIds,
  type CourseBundle,
} from '../../../../shared/arhud/bundle_client';
import { listCachedCourseIds } from '../../../../shared/arhud/offline';
import { planPrefetch, pruneBundles, runPrefetch } from '../../../../shared/arhud/prefetch';

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  headers: { get(name: string): string | null };
};

const originalFetch = globalThis.fetch;

const bundleTemplate = {
  version: 1,
  ttlSec: 3600,
  features: [] as CourseBundle['features'],
  greensById: {} as CourseBundle['greensById'],
};

type BundleOverrides = Record<string, Partial<Omit<CourseBundle, 'courseId'>>>;

function createResponse(body: unknown, status = 200, etag: string | null = null): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get(name: string) {
        if (etag && name.toLowerCase() === 'etag') {
          return etag;
        }
        return null;
      },
    },
  };
}

function installFetchMock(indexIds: string[], bundles: BundleOverrides): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/bundle/index')) {
      const entries = indexIds.map((courseId) => ({
        courseId,
        bbox: [0, 0, 0, 0],
      }));
      return createResponse(entries);
    }
    const match = /\/bundle\/course\/(.+)$/.exec(url);
    if (match) {
      const id = match[1];
      const overrides = bundles[id] ?? {};
      const payload = { ...bundleTemplate, ...overrides, courseId: id } satisfies CourseBundle;
      return createResponse(payload, 200, 'W/"etag"');
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

type CachedRecord = {
  id: string;
  savedAt: number;
  ttlSec: number;
  etag: string | null;
  payload: CourseBundle;
};

function createBackend() {
  const store = new Map<string, CachedRecord>();
  return {
    store,
    backend: {
      describe: () => 'test-memory',
      async read(id: string) {
        return store.get(id) ?? null;
      },
      async write(record: unknown) {
        const rec = record as CachedRecord;
        if (rec?.id) {
          store.set(rec.id, rec);
        }
      },
      async remove(id: string) {
        store.delete(id);
      },
      async list() {
        return Array.from(store.keys());
      },
    },
  } as const;
}

test.beforeEach(() => {
  __resetBundleClientForTests();
  const { backend } = createBackend();
  __setBundleCacheBackendForTests(backend);
});

test.afterEach(() => {
  __resetBundleClientForTests();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  }
});

test('plan picks last course and nearest neighbours', async () => {
  installFetchMock(['course-a', 'course-b', 'course-c'], {});

  const plan = await planPrefetch({
    lastCourseId: 'course-b',
    nearby: [
      { courseId: 'course-c', dist_km: 4 },
      { courseId: 'course-a', dist_km: 2 },
      { courseId: 'missing', dist_km: 1 },
    ],
  });

  assert.deepEqual(plan.courseIds, ['course-b', 'course-a', 'course-c']);
});

test('runPrefetch downloads uncached bundles and skips cached ones', async () => {
  installFetchMock(['alpha', 'beta'], {
    alpha: { version: 1 },
    beta: { version: 2 },
  });

  const plan = await planPrefetch({ lastCourseId: 'alpha', nearby: [{ courseId: 'beta', dist_km: 1 }] });

  const first = await runPrefetch(plan);
  assert.deepEqual(first.failed, []);
  assert.deepEqual(first.skipped, []);
  assert.deepEqual(first.downloaded.sort(), ['alpha', 'beta']);

  const second = await runPrefetch(plan);
  assert.deepEqual(second.failed, []);
  assert.deepEqual(second.downloaded, []);
  assert.deepEqual(second.skipped.sort(), ['alpha', 'beta']);

  const cached = await listCachedCourseIds();
  assert.deepEqual(cached.sort(), ['alpha', 'beta']);

  const meta = getLastBundleFetchMeta('alpha');
  assert(meta);
  assert.equal(meta?.fromCache, true);
});

test('pruneBundles removes caches not in keep set', async () => {
  installFetchMock(['one', 'two', 'three'], {
    one: { version: 1 },
    two: { version: 1 },
    three: { version: 1 },
  });

  const plan = await planPrefetch({
    lastCourseId: 'one',
    nearby: [
      { courseId: 'two', dist_km: 1 },
      { courseId: 'three', dist_km: 2 },
    ],
    maxCourses: 3,
  });

  await runPrefetch(plan);
  const removed = await pruneBundles(['one']);
  assert.deepEqual(removed.sort(), ['three', 'two']);
  const remaining = await listCachedBundleIds();
  assert.deepEqual(remaining, ['one']);
});
