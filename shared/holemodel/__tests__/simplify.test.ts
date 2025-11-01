import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simplifyPolygon, simplifyHoleModel } from '../simplify.js'
import { type HoleModel, type Polygon } from '../types.js'

const noisyPolygon: Polygon = [
  { lat: 0, lon: 0 },
  { lat: 0.001, lon: 0.0001 },
  { lat: 0.002, lon: 0.0002 },
  { lat: 1, lon: 1 },
]

describe('simplify', () => {
  it('removes redundant intermediate points', () => {
    const simplified = simplifyPolygon(noisyPolygon, 0.01)
    assert.equal(simplified.length, 2)
    assert.deepEqual(simplified[0], noisyPolygon[0])
    assert.deepEqual(simplified[1], noisyPolygon[3])
  })

  it('simplifies entire hole model', () => {
    const model: HoleModel = {
      id: 'test',
      bbox: { minLat: 0, minLon: 0, maxLat: 2, maxLon: 2 },
      fairways: [noisyPolygon],
      greens: [noisyPolygon],
      bunkers: [],
    }

    const simplified = simplifyHoleModel(model, 0.01)
    simplified.fairways.forEach((polygon) => {
      assert.equal(polygon.length, 2)
    })
    simplified.greens.forEach((polygon) => {
      assert.equal(polygon.length, 2)
    })
    assert.equal(simplified.bunkers.length, 0)
  })
})
