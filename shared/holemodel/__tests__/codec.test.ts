import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseHoleModel, stringifyHoleModel } from '../codec.js'
import { type HoleModel } from '../types.js'

describe('hole model codec', () => {
  it('parses id as string even if numeric', () => {
    const json = JSON.stringify({
      id: 123,
      holes: [
        {
          id: 9,
          fmb: {
            front: [0, 0],
            middle: [1, 1],
            back: [2, 2],
          },
        },
      ],
    })
    const parsed = parseHoleModel(json)
    assert.equal(parsed.id, '123')
    assert.equal(parsed.holes[0]?.id, '9')
  })

  it('throws on bad shapes', () => {
    assert.throws(() =>
      parseHoleModel({
        id: 'x',
        holes: [
          {
            id: 'a',
            fmb: {
              front: { x: 0 },
              middle: [1, 1],
              back: [2, 2],
            },
          },
        ],
      }),
    )
  })

  it('stringify → parse roundtrip', () => {
    const src: HoleModel = {
      id: 'course-1',
      version: 1,
      holes: [
        {
          id: '1',
          fmb: {
            front: { x: 0, y: 0 },
            middle: { x: 1, y: 1 },
            back: { x: 2, y: 2 },
          },
        },
      ],
    }

    const out = parseHoleModel(stringifyHoleModel(src))
    assert.equal(out.holes.length, 1)
    assert.equal(out.holes[0]?.fmb.middle.x, 1)
  })
})
