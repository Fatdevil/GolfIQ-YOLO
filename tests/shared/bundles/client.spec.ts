import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BundleClient } from '../../../shared/bundles/client';
import { BundleStore } from '../../../shared/bundles/store';
import type { CourseBundleManifest } from '../../../shared/bundles/types';
import { __resetMemoryStoreForTests } from '../../../shared/core/pstore';

function hashBase64(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('base64');
}

function headersToObject(init?: RequestInit): Record<string, string> {
  const map = new Map<string, string>();
  const source = init?.headers;
  if (!source) {
    return {};
  }
  if (source instanceof Headers) {
    source.forEach((value, key) => map.set(key.toLowerCase(), value));
  } else if (Array.isArray(source)) {
    for (const [key, value] of source) {
      if (typeof key === 'string' && typeof value === 'string') {
        map.set(key.toLowerCase(), value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(source as Record<string, string>)) {
      if (typeof value === 'string') {
        map.set(key.toLowerCase(), value);
      }
    }
  }
  return Object.fromEntries(map);
}

type MockCall = { url: string; headers: Record<string, string> };

describe('BundleClient', () => {
  beforeEach(() => {
    __resetMemoryStoreForTests();
  });

  it('serves cached bundles and revalidates after TTL expiry', async () => {
    const bundleBytes = new Uint8Array([1, 2, 3, 4]);
    const digest = hashBase64(bundleBytes);
    let manifestRequests = 0;
    let now = 0;

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/manifest.json')) {
        manifestRequests += 1;
        if (manifestRequests === 1) {
          const body = {
            id: 'demo-course',
            v: 1,
            updatedAt: now,
            ttlSec: 60,
            sha256: digest,
            sizeBytes: bundleBytes.byteLength,
            holes: [],
          } satisfies CourseBundleManifest;
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
          });
        }
        return new Response(null, { status: 304, headers: { ETag: '"v1"' } });
      }
      if (url.endsWith('/bundle.bin')) {
        return new Response(bundleBytes, { status: 200 });
      }
      throw new Error(`Unexpected request to ${url}`);
    });

    const store = new BundleStore({ maxBytes: 1024, highWatermark: 512 });
    const client = new BundleClient(store, {
      baseUrl: 'https://api.example.com/bundles',
      ttlDefaultSec: 30,
      fetchImpl: fetchMock,
      clock: () => now,
    });

    const first = await client.ensure('demo-course');
    expect(first.status).toBe('fresh');
    expect(first.manifest?.v).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 30 * 1000;
    const second = await client.ensure('demo-course');
    expect(second.status).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 40 * 1000;
    const third = await client.ensure('demo-course');
    expect(third.status).toBe('stale');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(third.reason).toBe('revalidated');

    const manifest = await client.manifest('demo-course');
    expect(manifest.stale).toBe(false);
    expect(manifest.manifest?.updatedAt).toBe(now);
  });

  it('respects ETag revalidation and caches new versions', async () => {
    const calls: MockCall[] = [];
    const v1Bytes = new Uint8Array([10, 11, 12]);
    const v2Bytes = new Uint8Array([20, 21, 22]);
    const v1Digest = hashBase64(v1Bytes);
    const v2Digest = hashBase64(v2Bytes);
    let phase: 'initial' | 'not-modified' | 'updated' = 'initial';

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, headers: headersToObject(init) });
      if (url.endsWith('/manifest.json')) {
        if (phase === 'initial') {
          phase = 'not-modified';
          return new Response(
            JSON.stringify({
              id: 'demo-course',
              v: 1,
              updatedAt: 0,
              ttlSec: 120,
              sha256: v1Digest,
              sizeBytes: v1Bytes.byteLength,
              holes: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"v1"' } },
          );
        }
        if (phase === 'not-modified') {
          phase = 'updated';
          return new Response(null, { status: 304, headers: { ETag: '"v1"' } });
        }
        return new Response(
          JSON.stringify({
            id: 'demo-course',
            v: 2,
            updatedAt: 0,
            ttlSec: 180,
            sha256: v2Digest,
            sizeBytes: v2Bytes.byteLength,
            holes: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"v2"' } },
        );
      }
      if (url.endsWith('/bundle.bin')) {
        if (phase === 'initial' || phase === 'not-modified') {
          return new Response(v1Bytes, { status: 200 });
        }
        return new Response(v2Bytes, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const store = new BundleStore({ maxBytes: 1024, highWatermark: 512 });
    const client = new BundleClient(store, {
      baseUrl: 'https://api.example.com/bundles',
      ttlDefaultSec: 120,
      fetchImpl: fetchMock,
      clock: () => 0,
    });

    const first = await client.ensure('demo-course');
    expect(first.status).toBe('fresh');
    expect(first.manifest?.etag).toBe('"v1"');

    const second = await client.refresh('demo-course');
    expect(second.status).toBe('fresh');
    const manifestCall = calls.filter((call) => call.url.endsWith('/manifest.json'))[1];
    expect(manifestCall.headers['if-none-match']).toBe('"v1"');

    const third = await client.refresh('demo-course');
    expect(third.status).toBe('fresh');
    expect(third.manifest?.v).toBe(2);
    expect(third.manifest?.etag).toBe('"v2"');
  });

  it('keeps previous bundle on integrity mismatch', async () => {
    const v1Bytes = new Uint8Array([5, 6, 7, 8]);
    const v1Digest = hashBase64(v1Bytes);
    const badBytes = new Uint8Array([9, 9, 9, 9]);
    let phase: 'initial' | 'invalid' = 'initial';

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/manifest.json')) {
        if (phase === 'initial') {
          return new Response(
            JSON.stringify({
              id: 'demo-course',
              v: 1,
              updatedAt: 0,
              ttlSec: 60,
              sha256: v1Digest,
              sizeBytes: v1Bytes.byteLength,
              holes: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"v1"' } },
          );
        }
        return new Response(
          JSON.stringify({
            id: 'demo-course',
            v: 2,
            updatedAt: 0,
            ttlSec: 60,
            sha256: v1Digest,
            sizeBytes: v1Bytes.byteLength,
            holes: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"v2"' } },
        );
      }
      if (url.endsWith('/bundle.bin')) {
        if (phase === 'initial') {
          phase = 'invalid';
          return new Response(v1Bytes, { status: 200 });
        }
        return new Response(badBytes, { status: 200 });
      }
      throw new Error(`Unexpected url ${url}`);
    });

    const store = new BundleStore({ maxBytes: 1024, highWatermark: 512 });
    const client = new BundleClient(store, {
      baseUrl: 'https://api.example.com/bundles',
      ttlDefaultSec: 60,
      fetchImpl: fetchMock,
      clock: () => 0,
    });

    const first = await client.ensure('demo-course');
    expect(first.status).toBe('fresh');
    const second = await client.refresh('demo-course');
    expect(second.status).toBe('invalid');
    expect(second.manifest?.v).toBe(1);
    const manifest = await client.manifest('demo-course');
    expect(manifest.manifest?.v).toBe(1);
  });

  it('surfaced network failures as errors while keeping cached data', async () => {
    const bundleBytes = new Uint8Array([1, 1, 1, 1]);
    const digest = hashBase64(bundleBytes);
    let phase: 'ok' | 'error' = 'ok';

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/manifest.json')) {
        if (phase === 'ok') {
          return new Response(
            JSON.stringify({
              id: 'demo-course',
              v: 1,
              updatedAt: 0,
              ttlSec: 30,
              sha256: digest,
              sizeBytes: bundleBytes.byteLength,
              holes: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"v1"' } },
          );
        }
        return new Response(null, { status: 500 });
      }
      if (url.endsWith('/bundle.bin')) {
        phase = 'error';
        return new Response(bundleBytes, { status: 200 });
      }
      throw new Error(`Unexpected url ${url}`);
    });

    const store = new BundleStore({ maxBytes: 1024, highWatermark: 512 });
    let now = 0;
    const client = new BundleClient(store, {
      baseUrl: 'https://api.example.com/bundles',
      ttlDefaultSec: 30,
      fetchImpl: fetchMock,
      clock: () => now,
    });

    const first = await client.ensure('demo-course');
    expect(first.status).toBe('fresh');
    now += 60 * 1000;
    const second = await client.refresh('demo-course');
    expect(second.status).toBe('error');
    expect(second.manifest?.v).toBe(1);
  });
});
