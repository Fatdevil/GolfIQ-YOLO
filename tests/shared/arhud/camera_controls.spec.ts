import assert from 'node:assert/strict';
import test from 'node:test';

import {
  lockExposure,
  lockWhiteBalance,
  unlockAll,
  __setCameraModuleForTests,
  type CameraModule,
} from '../../../shared/arhud/camera';

test.afterEach(() => {
  __setCameraModuleForTests(undefined);
});

test('camera controls resolve when native module is missing', async () => {
  __setCameraModuleForTests(null);
  assert.equal(await lockExposure(), false);
  assert.equal(await lockWhiteBalance(), false);
  assert.equal(await unlockAll(), false);
});

test('camera controls prefer exposure/white balance locks when available', async () => {
  const calls: string[] = [];
  const module: CameraModule = {
    Camera: {
      setExposureModeAsync: async (mode: string) => {
        calls.push(`exposure:${mode}`);
      },
      setWhiteBalanceAsync: async (mode: string) => {
        calls.push(`white:${mode}`);
      },
    },
  };
  __setCameraModuleForTests(module);
  assert.equal(await lockExposure(), true);
  assert.equal(await lockWhiteBalance(), true);
  assert.equal(await unlockAll(), true);
  assert.ok(calls.includes('exposure:locked'));
  assert.ok(calls.includes('white:locked'));
  assert.ok(calls.some((call) => call.startsWith('exposure:')));
});

test('camera unlock falls back to automatic modes', async () => {
  const calls: string[] = [];
  const module: CameraModule = {
    Camera: {
      unlockExposureAsync: async () => {
        calls.push('unlock:exposure');
      },
      unlockWhiteBalanceAsync: async () => {
        calls.push('unlock:white');
      },
    },
  };
  __setCameraModuleForTests(module);
  assert.equal(await unlockAll(), true);
  assert.ok(calls.includes('unlock:exposure'));
  assert.ok(calls.includes('unlock:white'));
});
