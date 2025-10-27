import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AutoCourseController,
  DISMISS_DURATION_MS,
  HYSTERESIS_MIN_GAIN_M,
  pickNearest,
} from '../../../shared/arhud/auto_course';
import type { BundleIndexEntry } from '../../../shared/arhud/bundle_client';
import type { LocationFix } from '../../../shared/arhud/location';

test('pickNearest returns the closest bundle by bounding box distance', () => {
  const index: BundleIndexEntry[] = [
    {
      courseId: 'alpha',
      name: 'Alpha Ridge',
      bbox: [-122.48, 37.70, -122.45, 37.73],
    },
    {
      courseId: 'beta',
      name: 'Beta Hills',
      bbox: [-122.40, 37.75, -122.37, 37.78],
    },
  ];
  const fix: LocationFix = {
    lat: 37.755,
    lon: -122.39,
    acc_m: 5,
    accuracy_m: 5,
    timestamp: Date.now(),
  };

  const candidate = pickNearest(index, fix);
  assert.ok(candidate, 'expected a candidate');
  assert.equal(candidate?.courseId, 'beta');
  assert.ok(Number.isFinite(candidate?.dist_m ?? NaN), 'distance should be finite');
});

test('AutoCourseController enforces hysteresis and dismiss timers', () => {
  const index: BundleIndexEntry[] = [
    {
      courseId: 'alpha',
      name: 'Alpha',
      bbox: [-0.01, -0.01, 0.0, 0.0],
    },
    {
      courseId: 'beta',
      name: 'Beta',
      bbox: [0.02, 0.02, 0.021, 0.021],
    },
  ];

  const far: LocationFix = { lat: 0.03, lon: 0.03, acc_m: 5, accuracy_m: 5, timestamp: 0 };
  const closer: LocationFix = { lat: 0.029, lon: 0.029, acc_m: 5, accuracy_m: 5, timestamp: 1 };
  const close: LocationFix = { lat: 0.024, lon: 0.024, acc_m: 5, accuracy_m: 5, timestamp: 2 };
  const veryClose: LocationFix = { lat: 0.022, lon: 0.022, acc_m: 5, accuracy_m: 5, timestamp: 3 };

  let now = 0;
  const controller = new AutoCourseController({ debounceMs: 0, now: () => now });

  let decision = controller.consider(index, far, 'alpha');
  assert.ok(decision.candidate, 'expected candidate on first consider');
  assert.equal(decision.candidate?.courseId, 'beta');
  assert.equal(decision.shouldPrompt, true, 'initial jump should prompt');

  now += 1000;
  decision = controller.consider(index, closer, 'alpha');
  assert.ok(decision.candidate, 'expected candidate after moving closer');
  assert.equal(decision.candidate?.courseId, 'beta');
  assert.equal(
    decision.shouldPrompt,
    false,
    `gain under ${HYSTERESIS_MIN_GAIN_M} m should not prompt again`,
  );

  now += 1000;
  decision = controller.consider(index, close, 'alpha');
  assert.ok(decision.candidate);
  assert.equal(decision.candidate?.courseId, 'beta');
  assert.equal(decision.shouldPrompt, true, 'larger gain should prompt');

  controller.recordDismiss();
  now += 1000;
  decision = controller.consider(index, close, 'alpha');
  assert.equal(decision.shouldPrompt, false, 'dismiss window suppresses prompt');

  now += DISMISS_DURATION_MS;
  decision = controller.consider(index, veryClose, 'alpha');
  assert.equal(decision.shouldPrompt, true, 'dismiss expiry should allow prompt again');
});

test('recordSwitch emits telemetry and resets dismissal', () => {
  const events: Record<string, unknown>[] = [];
  const original = (globalThis as { __ARHUD_BUNDLE_FETCH_LOG__?: unknown }).__ARHUD_BUNDLE_FETCH_LOG__;
  (globalThis as { __ARHUD_BUNDLE_FETCH_LOG__?: unknown }).__ARHUD_BUNDLE_FETCH_LOG__ = (payload: Record<string, unknown>) => {
    events.push(payload);
  };

  try {
    const controller = new AutoCourseController({ debounceMs: 0 });
    controller.recordDismiss();
    controller.recordSwitch('gamma', 420);
    const decision = controller.consider([], null, 'gamma');
    assert.equal(decision.shouldPrompt, false, 'no prompt without candidates');
    assert.equal(events.length, 1);
    const payload = events[0];
    assert.equal(payload.event, 'bundle.autopick');
    assert.equal(payload.id, 'gamma');
    assert.equal(payload.dist_m, 420);
    assert.ok(typeof payload.timestamp === 'number');
  } finally {
    if (original) {
      (globalThis as { __ARHUD_BUNDLE_FETCH_LOG__?: unknown }).__ARHUD_BUNDLE_FETCH_LOG__ = original;
    } else {
      delete (globalThis as { __ARHUD_BUNDLE_FETCH_LOG__?: unknown }).__ARHUD_BUNDLE_FETCH_LOG__;
    }
  }
});
