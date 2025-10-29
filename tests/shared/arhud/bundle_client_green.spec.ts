import assert from 'node:assert/strict';
import test from 'node:test';

import type { CourseBundle } from '../../../shared/arhud/bundle_client';
import { getFatSide, getGreenSections, getPin } from '../../../shared/arhud/bundle_client';

test('green metadata getters expose parsed sections, fat side, and pin', () => {
  const bundle: CourseBundle = {
    courseId: 'demo-green',
    version: 1,
    ttlSec: 300,
    features: [
      {
        id: 'g1',
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        green: {
          sections: ['front', 'middle', 'back'],
          fatSide: 'L',
          pin: { lat: 35.0, lon: -80.0, ts: '2025-03-01T10:30:00Z' },
        },
      },
    ],
    greensById: {
      g1: {
        sections: ['front', 'middle', 'back'],
        fatSide: 'L',
        pin: { lat: 35.0, lon: -80.0, ts: '2025-03-01T10:30:00Z' },
      },
    },
  };

  assert.deepEqual(getGreenSections(bundle, 'g1'), ['front', 'middle', 'back']);
  assert.equal(getFatSide(bundle, 'g1'), 'L');
  const pin = getPin(bundle, 'g1');
  assert.deepEqual(pin, { lat: 35.0, lon: -80.0, ts: '2025-03-01T10:30:00Z' });
  assert.notStrictEqual(pin, bundle.greensById.g1.pin);
});

test('green metadata getters handle missing data gracefully', () => {
  const bundle: CourseBundle = {
    courseId: 'missing-green',
    version: 1,
    ttlSec: 120,
    features: [],
    greensById: {},
  };

  assert.deepEqual(getGreenSections(bundle, 'unknown'), []);
  assert.equal(getFatSide(bundle, 'unknown'), null);
  assert.equal(getPin(bundle, 'unknown'), null);
});
