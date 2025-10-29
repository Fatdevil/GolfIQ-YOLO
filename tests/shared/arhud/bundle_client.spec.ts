import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  __resetBundleClientForTests,
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
} from '../../../shared/arhud/bundle_client';

type HeadersRecord = Record<string, string>;
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

type FetchCall = {
  url: string;
  headers: HeadersRecord;
};

function normalizeHeaders(init?: FetchInit): HeadersRecord {
  const map = new Map<string, string>();
  const source = init?.headers;
  if (!source) {
    return {};
  }
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      map.set(key.toLowerCase(), value);
    });
  } else if (Array.isArray(source)) {
    for (const [key, value] of source) {
      if (typeof key === 'string' && typeof value === 'string') {
        map.set(key.toLowerCase(), value);
      }
    }
  } else {
    const entries = Object.entries(source as Record<string, string>);
    for (const [key, value] of entries) {
      if (typeof value === 'string') {
        map.set(key.toLowerCase(), value);
      }
    }
  }
  return Object.fromEntries(map);
}

async function withTempCache(fn: (dir: string) => Promise<void>): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'bundle-client-'));
  const previous = process.env.ARHUD_BUNDLE_CACHE_DIR;
  process.env.ARHUD_BUNDLE_CACHE_DIR = tempRoot;
  try {
    await fn(tempRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.ARHUD_BUNDLE_CACHE_DIR;
    } else {
      process.env.ARHUD_BUNDLE_CACHE_DIR = previous;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('getBundle caches payloads and revalidates with ETag', async (t) => {
  await withTempCache(async () => {
    __resetBundleClientForTests();
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    const calls: FetchCall[] = [];
    let now = Date.now();
    Date.now = () => now;
    let requestCount = 0;

    t.after(() => {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
      __resetBundleClientForTests();
    });

    globalThis.fetch = async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const headers = normalizeHeaders(init);
      calls.push({ url, headers });
      requestCount += 1;
      if (url.endsWith('/bundle/course/demo-course')) {
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({ courseId: 'demo-course', version: 1, ttlSec: 60, features: [] }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ETag: '"demo-v1"',
              },
            },
          );
        }
        if (requestCount === 2) {
          return new Response(null, {
            status: 304,
            headers: { ETag: '"demo-v1"' },
          });
        }
        throw new Error(`Unexpected bundle fetch ${requestCount}`);
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const first = await getBundle('demo-course');
    assert.equal(first.courseId, 'demo-course');
    assert.equal(first.version, 1);
    assert.equal(calls.length, 1);
    const metaFirst = getLastBundleFetchMeta('demo-course');
    assert.ok(metaFirst);
    assert.equal(metaFirst?.fromCache, false);

    const second = await getBundle('demo-course');
    assert.equal(second.version, 1);
    assert.equal(calls.length, 1);
    const metaSecond = getLastBundleFetchMeta('demo-course');
    assert.ok(metaSecond);
    assert.equal(metaSecond?.fromCache, true);

    now += 70_000;

    const third = await getBundle('demo-course');
    assert.equal(third.version, 1);
    assert.equal(calls.length, 2);
    const { headers } = calls[1];
    assert.equal(headers['if-none-match'], '"demo-v1"');
    const metaThird = getLastBundleFetchMeta('demo-course');
    assert.ok(metaThird);
    assert.equal(metaThird?.fromCache, true);

    now += 30_000;
    const fourth = await getBundle('demo-course');
    assert.equal(fourth.version, 1);
    assert.equal(calls.length, 2);
  });
});

test('getBundle falls back to cache on network failure', async (t) => {
  await withTempCache(async () => {
    __resetBundleClientForTests();
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    let now = Date.now();
    Date.now = () => now;
    let callIndex = 0;

    t.after(() => {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
      __resetBundleClientForTests();
    });

    globalThis.fetch = async (input: FetchInput) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.endsWith('/bundle/course/demo-course')) {
        throw new Error(`Unexpected URL ${url}`);
      }
      callIndex += 1;
      if (callIndex === 1) {
        return new Response(
          JSON.stringify({ courseId: 'demo-course', version: 2, ttlSec: 30, features: [{ id: 'g1' }] }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ETag: '"demo-v2"',
            },
          },
        );
      }
      throw new Error('network down');
    };

    const seeded = await getBundle('demo-course');
    assert.equal(seeded.version, 2);

    now += 45_000;

    const fallback = await getBundle('demo-course');
    assert.equal(fallback.version, 2);
    const meta = getLastBundleFetchMeta('demo-course');
    assert.ok(meta);
    assert.equal(meta?.fromCache, true);
  });
});

test('getIndex parses bundle index entries', async (t) => {
  __resetBundleClientForTests();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    __resetBundleClientForTests();
  });
  globalThis.fetch = async (input: FetchInput) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.endsWith('/bundle/index')) {
      throw new Error(`Unexpected URL ${url}`);
    }
    return new Response(
      JSON.stringify([
        { courseId: 'demo', name: 'Demo', bbox: [-122.4, 37.7, -122.3, 37.8], updatedAt: '2025-01-01T00:00:00Z' },
        { courseId: 42, bbox: [0, 0, 0, 0] },
      ]),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  const index = await getIndex();
  assert.equal(index.length, 1);
  assert.equal(index[0]?.courseId, 'demo');
  assert.equal(index[0]?.name, 'Demo');
  assert.deepEqual(index[0]?.bbox, [-122.4, 37.7, -122.3, 37.8]);
});

test('green metadata is normalised and indexed by id', async (t) => {
  __resetBundleClientForTests();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    __resetBundleClientForTests();
  });
  globalThis.fetch = async (input: FetchInput) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.endsWith('/bundle/course/greens-demo')) {
      throw new Error(`Unexpected URL ${url}`);
    }
    return new Response(
      JSON.stringify({
        courseId: 'greens-demo',
        version: 1,
        ttlSec: 120,
        features: [
          {
            id: 'g1',
            type: 'Feature',
            green: {
              sections: ['front', 'front', 'middle'],
              fatSide: 'l',
              pin: { lat: 37.7751, lon: -122.4192, ts: '2025-01-02T12:00:00Z' },
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-122.4195, 37.775],
                  [-122.4190, 37.775],
                  [-122.4190, 37.7754],
                  [-122.4195, 37.7754],
                  [-122.4195, 37.775],
                ],
              ],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  const bundle = await getBundle('greens-demo');
  assert.equal(bundle.greensById.g1?.fatSide, 'L');
  assert.deepEqual(bundle.greensById.g1?.sections, ['front', 'middle']);
  assert.deepEqual(bundle.greensById.g1?.pin, {
    lat: 37.7751,
    lon: -122.4192,
    ts: '2025-01-02T12:00:00Z',
  });
  assert.equal(bundle.features[0]?.green?.fatSide, 'L');
  assert.deepEqual(bundle.features[0]?.green?.sections, ['front', 'middle']);
  assert.deepEqual(bundle.features[0]?.green?.pin, {
    lat: 37.7751,
    lon: -122.4192,
    ts: '2025-01-02T12:00:00Z',
  });
});

