import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  __resetEdgeModelLoaderForTests,
  __setEdgeModelStorageForTests,
  ensureModel,
  verifySha256,
} from '../../../shared/edge/model_loader';

function createMemoryStorage() {
  const files = new Map<string, Uint8Array>();
  const storage = {
    root: '/mem',
    files,
    join: (...segments: string[]): string => ['/mem', ...segments].join('/'),
    async readFile(path: string): Promise<Uint8Array | null> {
      const value = files.get(path);
      return value ? new Uint8Array(value) : null;
    },
    async writeFile(path: string, data: Uint8Array): Promise<void> {
      files.set(path, new Uint8Array(data));
    },
    async removeFile(path: string): Promise<void> {
      files.delete(path);
    },
    async ensureDir(_path: string): Promise<void> {
      // no-op for in-memory storage
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
  };
  return storage;
}

function createResponse(body: string, init: ResponseInit = {}): Response {
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...(init.headers ?? {}) };
  return new Response(body, { status: init.status ?? 200, headers });
}

test('verifySha256 validates stored model content', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const data = new TextEncoder().encode('edge-model-bytes');
  const digest = createHash('sha256').update(data).digest('hex');
  const path = storage.join('android', 'demo.tflite');
  await storage.writeFile(path, data);

  t.after(() => {
    __resetEdgeModelLoaderForTests();
  });

  assert.equal(await verifySha256(path, digest), true);
  assert.equal(await verifySha256(path, '0'.repeat(64)), false);
  assert.equal(await verifySha256(storage.join('android', 'missing.tflite'), digest), false);
});

test('ensureModel downloads and caches manifest entries', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const modelData = new TextEncoder().encode('android-model');
  const modelSha = createHash('sha256').update(modelData).digest('hex');
  const manifest = {
    version: 1,
    recommended: { android: 'demo-model-int8-320' },
    android: [
      {
        id: 'demo-model-int8-320',
        url: 'https://cdn.example.com/android/demo-model.tflite',
        sha256: modelSha,
        size: modelData.length,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
    ],
    ios: [
      {
        id: 'ios-model-fp16-384',
        url: 'https://cdn.example.com/ios/ios-model.mlmodelc',
        sha256: 'f' * 64,
        size: 1,
        runtime: 'coreml',
        inputSize: 384,
        quant: 'fp16',
      },
    ],
  };

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push(url);
    if (url.includes('/models/manifest.json')) {
      return createResponse(JSON.stringify(manifest));
    }
    if (url.endsWith('/android/demo-model.tflite')) {
      return new Response(modelData, { status: 200 });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    __resetEdgeModelLoaderForTests();
  });

  const result = await ensureModel({ platform: 'android' });
  const expectedPath = storage.join('android', 'demo-model-int8-320.tflite');
  assert.equal(result.path, expectedPath);
  assert.equal(await verifySha256(result.path, modelSha), true);
  const metaPath = storage.join('android', 'last-good.json');
  assert.equal(storage.files.has(metaPath), true);

  const second = await ensureModel({ platform: 'android' });
  assert.equal(second.path, expectedPath);
  const downloadCalls = calls.filter((value) => value.endsWith('/android/demo-model.tflite'));
  assert.equal(downloadCalls.length, 1);
});

test('ensureModel respects remote config pinned id override', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const dataA = new TextEncoder().encode('model-A');
  const shaA = createHash('sha256').update(dataA).digest('hex');
  const dataB = new TextEncoder().encode('model-B');
  const shaB = createHash('sha256').update(dataB).digest('hex');

  const manifest = {
    version: 1,
    android: [
      {
        id: 'model-a-int8-320',
        url: 'https://cdn.example.com/android/model-a.tflite',
        sha256: shaA,
        size: dataA.length,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
      {
        id: 'model-b-int8-320',
        url: 'https://cdn.example.com/android/model-b.tflite',
        sha256: shaB,
        size: dataB.length,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
    ],
    ios: [
      {
        id: 'ios-model-fp16-384',
        url: 'https://cdn.example.com/ios/ios-model.mlmodelc',
        sha256: 'e' * 64,
        size: 1,
        runtime: 'coreml',
        inputSize: 384,
        quant: 'fp16',
      },
    ],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    if (url.includes('/models/manifest.json')) {
      return createResponse(JSON.stringify(manifest));
    }
    if (url.endsWith('/android/model-a.tflite')) {
      return new Response(dataA, { status: 200 });
    }
    if (url.endsWith('/android/model-b.tflite')) {
      return new Response(dataB, { status: 200 });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  const originalRc = (globalThis as { RC?: Record<string, unknown> }).RC;
  (globalThis as { RC?: Record<string, unknown> }).RC = {
    'edge.model.pinnedId': 'model-b-int8-320',
    'edge.defaults.enforce': false,
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { RC?: Record<string, unknown> }).RC = originalRc;
    __resetEdgeModelLoaderForTests();
  });

  const result = await ensureModel({ platform: 'android', id: 'model-a-int8-320' });
  assert.equal(result.path, storage.join('android', 'model-b-int8-320.tflite'));
  assert.equal(await verifySha256(result.path, shaB), true);
});

test('ensureModel falls back to last known good model on download failure', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const fallbackData = new TextEncoder().encode('existing-model');
  const fallbackSha = createHash('sha256').update(fallbackData).digest('hex');
  const fallbackPath = storage.join('android', 'cached-model.tflite');
  await storage.writeFile(fallbackPath, fallbackData);
  const metadata = {
    modelId: 'cached-model-int8-320',
    sha256: fallbackSha,
    path: fallbackPath,
    savedAt: Date.now(),
    platform: 'android',
  };
  await storage.writeFile(
    storage.join('android', 'last-good.json'),
    new TextEncoder().encode(JSON.stringify(metadata)),
  );

  const manifest = {
    version: 1,
    recommended: { android: 'fresh-model-int8-320' },
    android: [
      {
        id: 'fresh-model-int8-320',
        url: 'https://cdn.example.com/android/fresh-model.tflite',
        sha256: 'd'.repeat(64),
        size: 42,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
    ],
    ios: [],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    if (url.includes('/models/manifest.json')) {
      return createResponse(JSON.stringify(manifest));
    }
    if (url.endsWith('/android/fresh-model.tflite')) {
      throw new Error('network unreachable');
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    __resetEdgeModelLoaderForTests();
  });

  const result = await ensureModel({ platform: 'android' });
  assert.equal(result.path, fallbackPath);
  assert.equal(await verifySha256(result.path, fallbackSha), true);
  assert.equal(await storage.exists(storage.join('android', 'fresh-model-int8-320.tflite')), false);
});

test('ensureModel enforces defaults when rollout gate applies', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const dataA = new TextEncoder().encode('model-A');
  const shaA = createHash('sha256').update(dataA).digest('hex');
  const dataB = new TextEncoder().encode('model-B');
  const shaB = createHash('sha256').update(dataB).digest('hex');

  const manifest = {
    version: 1,
    recommended: { android: 'model-a-int8-320' },
    android: [
      {
        id: 'model-a-int8-320',
        url: 'https://cdn.example.com/android/model-a.tflite',
        sha256: shaA,
        size: dataA.length,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
      {
        id: 'model-b-fp16-384',
        url: 'https://cdn.example.com/android/model-b.tflite',
        sha256: shaB,
        size: dataB.length,
        runtime: 'tflite',
        inputSize: 384,
        quant: 'fp16',
      },
    ],
  };

  const defaultsPayload = {
    android: {
      runtime: 'tflite',
      inputSize: 384,
      quant: 'fp16',
    },
  };

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push(url);
    if (url.includes('/models/manifest.json')) {
      return createResponse(JSON.stringify(manifest));
    }
    if (url.includes('/bench/summary')) {
      return createResponse(JSON.stringify(defaultsPayload));
    }
    if (url.endsWith('/android/model-b.tflite')) {
      return new Response(dataB, { status: 200 });
    }
    if (url.endsWith('/android/model-a.tflite')) {
      return new Response(dataA, { status: 200 });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  const originalRc = (globalThis as { RC?: Record<string, unknown> }).RC;
  (globalThis as { RC?: Record<string, unknown> }).RC = {
    'edge.defaults.enforce': false,
    'edge.rollout.enabled': true,
    'edge.rollout.percent': 100,
    'edge.rollout.kill': false,
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { RC?: Record<string, unknown> }).RC = originalRc;
    __resetEdgeModelLoaderForTests();
  });

  const result = await ensureModel({ platform: 'android', id: 'model-a-int8-320' });
  assert.equal(result.path, storage.join('android', 'model-b-fp16-384.tflite'));
  assert.equal(await verifySha256(result.path, shaB), true);
  assert.ok(calls.some((url) => url.includes('/bench/summary')));
});

test('ensureModel kill switch disables enforcement', async (t) => {
  __resetEdgeModelLoaderForTests();
  const storage = createMemoryStorage();
  __setEdgeModelStorageForTests(storage);

  const dataA = new TextEncoder().encode('model-A');
  const shaA = createHash('sha256').update(dataA).digest('hex');
  const dataB = new TextEncoder().encode('model-B');
  const shaB = createHash('sha256').update(dataB).digest('hex');

  const manifest = {
    version: 1,
    recommended: { android: 'model-a-int8-320' },
    android: [
      {
        id: 'model-a-int8-320',
        url: 'https://cdn.example.com/android/model-a.tflite',
        sha256: shaA,
        size: dataA.length,
        runtime: 'tflite',
        inputSize: 320,
        quant: 'int8',
      },
      {
        id: 'model-b-fp16-384',
        url: 'https://cdn.example.com/android/model-b.tflite',
        sha256: shaB,
        size: dataB.length,
        runtime: 'tflite',
        inputSize: 384,
        quant: 'fp16',
      },
    ],
  };

  const defaultsPayload = {
    android: {
      runtime: 'tflite',
      inputSize: 384,
      quant: 'fp16',
    },
  };

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push(url);
    if (url.includes('/models/manifest.json')) {
      return createResponse(JSON.stringify(manifest));
    }
    if (url.includes('/bench/summary')) {
      return createResponse(JSON.stringify(defaultsPayload));
    }
    if (url.endsWith('/android/model-a.tflite')) {
      return new Response(dataA, { status: 200 });
    }
    if (url.endsWith('/android/model-b.tflite')) {
      return new Response(dataB, { status: 200 });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  const originalRc = (globalThis as { RC?: Record<string, unknown> }).RC;
  (globalThis as { RC?: Record<string, unknown> }).RC = {
    'edge.defaults.enforce': true,
    'edge.rollout.enabled': true,
    'edge.rollout.percent': 100,
    'edge.rollout.kill': true,
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { RC?: Record<string, unknown> }).RC = originalRc;
    __resetEdgeModelLoaderForTests();
  });

  const result = await ensureModel({ platform: 'android', id: 'model-a-int8-320' });
  assert.equal(result.path, storage.join('android', 'model-a-int8-320.tflite'));
  assert.equal(await verifySha256(result.path, shaA), true);
  const benchCalls = calls.filter((url) => url.includes('/bench/summary'));
  assert.equal(benchCalls.length, 0);
});
