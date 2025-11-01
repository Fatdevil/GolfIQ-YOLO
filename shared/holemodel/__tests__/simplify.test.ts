import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simplifyPolygon, simplifyHoleModel } from '../simplify.js'
import { type HoleModel, type Polygon } from '../types.js'

const noisyPolygon: Polygon = [
  { x: 0, y: 0 },
  { x: 0.001, y: 0.0001 },
  { x: 0.002, y: 0.0002 },
  { x: 1, y: 1 },
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
      version: 2,
      holes: [
        {
          id: '1',
          fmb: {
            front: { x: 0, y: 0 },
            middle: { x: 0.5, y: 0.5 },
            back: { x: 1, y: 1 },
          },
        },
      ],
    }

    const simplified = simplifyHoleModel(model, 0.01)
    assert.deepEqual(simplified, model)
  })
})
