import assert from 'node:assert/strict';
import test from 'node:test';

declare module '@react-native-async-storage/async-storage' {
  interface AsyncStorageLike {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem?(key: string): Promise<void>;
  }

  const AsyncStorage: AsyncStorageLike;
  export default AsyncStorage;
}

import {
  __resetEdgeDefaultsCacheForTests,
  fetchEdgeDefaults,
  getCachedEdgeDefaults,
  maybeEnforceEdgeDefaultsInRuntime,
  type EdgeDefaultsMap,
} from '../../../shared/edge/defaults';
import type { EdgeRolloutDecision } from '../../../shared/edge/rollout';

const SAMPLE_DEFAULTS: EdgeDefaultsMap = {
  android: {
    runtime: 'tflite',
    inputSize: 320,
    quant: 'int8',
    threads: 4,
    delegate: 'nnapi',
  },
  ios: {
    runtime: 'coreml',
    inputSize: 384,
    quant: 'fp16',
    threads: 2,
  },
};

test('fetchEdgeDefaults parses response and caches to storage', async (t) => {
  __resetEdgeDefaultsCacheForTests();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const records: string[] = [];
  const storage = {
    async getItem(): Promise<string | null> {
      return records.length ? records[records.length - 1] : null;
    },
    async setItem(_: string, value: string): Promise<void> {
      records.push(value);
    },
  };
  (globalThis as typeof globalThis & { __EDGE_DEFAULTS_STORAGE__?: typeof storage }).__EDGE_DEFAULTS_STORAGE__ = storage;
  globalThis.fetch = async (input: unknown) => {
    calls.push(typeof input === 'string' ? input : String(input));
    return new Response(JSON.stringify(SAMPLE_DEFAULTS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await t.test('initial fetch resolves defaults', async () => {
    const result = await fetchEdgeDefaults();
    assert.deepEqual(result, SAMPLE_DEFAULTS);
    assert.strictEqual(records.length, 1);
    const android = await getCachedEdgeDefaults('android');
    assert.deepEqual(android, SAMPLE_DEFAULTS.android);
    const ios = await getCachedEdgeDefaults('ios');
    assert.deepEqual(ios, SAMPLE_DEFAULTS.ios);
    assert.strictEqual(calls.length, 1);
  });
  globalThis.fetch = originalFetch;
  delete (globalThis as typeof globalThis & { __EDGE_DEFAULTS_STORAGE__?: typeof storage })
    .__EDGE_DEFAULTS_STORAGE__;
});

test('fetchEdgeDefaults falls back when server fails', async () => {
  __resetEdgeDefaultsCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('nope', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  const result = await fetchEdgeDefaults();
  assert.strictEqual(result.android?.runtime, 'tflite');
  assert.strictEqual(result.ios?.runtime, 'coreml');
  const android = await getCachedEdgeDefaults('android');
  assert.strictEqual(android?.runtime, 'tflite');
  globalThis.fetch = originalFetch;
});

test('maybeEnforceEdgeDefaultsInRuntime is a noop when gate is disabled', async () => {
  __resetEdgeDefaultsCacheForTests();
  const applied: unknown[] = [];
  await maybeEnforceEdgeDefaultsInRuntime({
    platform: 'android',
    rcEnforce: false,
    apply: (value) => {
      applied.push(value);
    },
  });
  assert.strictEqual(applied.length, 0);
});

test('maybeEnforceEdgeDefaultsInRuntime applies cached defaults when enabled', async () => {
  __resetEdgeDefaultsCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(SAMPLE_DEFAULTS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  await fetchEdgeDefaults();
  const applied: unknown[] = [];
  const states: EdgeRolloutDecision[] = [];
  await maybeEnforceEdgeDefaultsInRuntime({
    platform: 'ios',
    rcEnforce: true,
    apply: (value) => {
      applied.push(value);
    },
    rollout: {
      deviceId: 'device-rollout',
      rc: {
        'edge.rollout.enabled': true,
        'edge.rollout.percent': 42,
        'edge.rollout.kill': false,
      },
      onEvaluated: (decision) => {
        states.push(decision);
      },
    },
  });
  assert.strictEqual(applied.length, 1);
  assert.deepEqual(applied[0], SAMPLE_DEFAULTS.ios);
  assert.strictEqual(states.length, 1);
  assert.equal(states[0].enforced, true);
  assert.equal(states[0].percent, 42);
  globalThis.fetch = originalFetch;
});

test('maybeEnforceEdgeDefaultsInRuntime respects rollout percentage when not forced', async () => {
  __resetEdgeDefaultsCacheForTests();
  const applied: unknown[] = [];
  const decisions: EdgeRolloutDecision[] = [];
  await maybeEnforceEdgeDefaultsInRuntime({
    platform: 'android',
    rcEnforce: false,
    apply: (value) => {
      applied.push(value);
    },
    rollout: {
      deviceId: 'device-percent-in',
      rc: {
        'edge.rollout.enabled': true,
        'edge.rollout.percent': 100,
        'edge.rollout.kill': false,
      },
      onEvaluated: (decision) => {
        decisions.push(decision);
      },
    },
  });
  assert.equal(applied.length, 1);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].enforced, true);

  __resetEdgeDefaultsCacheForTests();
  const appliedOut: unknown[] = [];
  const decisionsOut: EdgeRolloutDecision[] = [];
  await maybeEnforceEdgeDefaultsInRuntime({
    platform: 'android',
    rcEnforce: false,
    apply: (value) => {
      appliedOut.push(value);
    },
    rollout: {
      deviceId: 'device-percent-out',
      rc: {
        'edge.rollout.enabled': true,
        'edge.rollout.percent': 0,
        'edge.rollout.kill': false,
      },
      onEvaluated: (decision) => {
        decisionsOut.push(decision);
      },
    },
  });
  assert.equal(appliedOut.length, 0);
  assert.equal(decisionsOut.length, 1);
  assert.equal(decisionsOut[0].enforced, false);
});

test('maybeEnforceEdgeDefaultsInRuntime honours kill switch even when enforcement forced', async () => {
  __resetEdgeDefaultsCacheForTests();
  const applied: unknown[] = [];
  const states: EdgeRolloutDecision[] = [];
  await maybeEnforceEdgeDefaultsInRuntime({
    platform: 'ios',
    rcEnforce: true,
    apply: (value) => {
      applied.push(value);
    },
    rollout: {
      deviceId: 'device-kill-switch',
      rc: {
        'edge.rollout.enabled': true,
        'edge.rollout.percent': 100,
        'edge.rollout.kill': true,
      },
      onEvaluated: (decision) => {
        states.push(decision);
      },
    },
  });
  assert.equal(applied.length, 0);
  assert.equal(states.length, 1);
  assert.equal(states[0].enforced, false);
  assert.equal(states[0].kill, true);
});
