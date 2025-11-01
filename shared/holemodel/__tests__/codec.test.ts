import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseHoleModel, serializeHoleModel } from '../codec.js'
import { type HoleModel } from '../types.js'

const sample: HoleModel = {
  id: '1',
  bbox: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
  fairways: [
    [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
    ],
  ],
  greens: [
    [
      { lat: 0.5, lon: 0.5 },
      { lat: 0.5, lon: 0.6 },
      { lat: 0.6, lon: 0.6 },
    ],
  ],
  bunkers: [],
  pin: { lat: 0.55, lon: 0.55 },
}

describe('hole model codec', () => {
  it('round-trips valid JSON', () => {
    const json = serializeHoleModel(sample)
    const parsed = parseHoleModel(json)
    assert.deepEqual(parsed, sample)
  })

  it('validates polygons and bbox', () => {
    assert.throws(() => parseHoleModel('{}'), /id: expected non-empty string/)
    assert.throws(
      () =>
        parseHoleModel({
          ...sample,
          fairways: [[{ lat: 0, lon: 0 }]],
        }),
      /invalid polygon/
    )
    assert.throws(
      () =>
        parseHoleModel({
          ...sample,
          bbox: { minLat: 1, minLon: 0, maxLat: 0, maxLon: 1 },
        }),
      /invalid bounding box/
    )
  })
})
