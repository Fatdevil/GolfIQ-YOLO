import { type HoleModel, type HoleRef, type Point } from './types.js'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

const asStr = (v: unknown, ctx: string): string => {
  if (isStr(v)) return v
  if (isNum(v)) return String(v)
  throw new Error(`${ctx} must be a string`)
}

const isPointObj = (v: any): v is Point =>
  v && typeof v === 'object' && isNum(v.x) && isNum(v.y)

const isTuple2 = (v: any): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])

const toPoint = (v: unknown, ctx: string): Point => {
  if (isPointObj(v)) return v
  if (isTuple2(v)) return { x: v[0], y: v[1] }
  throw new Error(`${ctx} must be {x,y} or [x,y]`)
}

export function parseHoleModel(input: unknown): HoleModel {
  const data = typeof input === 'string' ? JSON.parse(input) : input
  if (data === null || typeof data !== 'object') {
    throw new Error('HoleModel must be an object or JSON string')
  }
  const o: any = data

  const model: HoleModel = {
    id: asStr(o.id, 'HoleModel.id'),
    version: isNum(o.version) ? o.version : undefined,
    holes: [],
  }

  const holes = Array.isArray(o.holes) ? o.holes : []
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i] as unknown
    if (!h || typeof h !== 'object') throw new Error(`holes[${i}] must be object`)
    const hh: any = h

    const hole: HoleRef = {
      id: asStr(hh.id, `holes[${i}].id`),
      fmb: {
        front: toPoint(hh.fmb?.front ?? hh.front, `holes[${i}].fmb.front`),
        middle: toPoint(hh.fmb?.middle ?? hh.middle, `holes[${i}].fmb.middle`),
        back: toPoint(hh.fmb?.back ?? hh.back, `holes[${i}].fmb.back`),
      },
    }
    model.holes.push(hole)
  }
  return model
}

export function stringifyHoleModel(m: HoleModel): string {
  return JSON.stringify({
    id: m.id,
    version: m.version,
    holes: m.holes.map((h) => ({
      id: h.id,
      fmb: { front: h.fmb.front, middle: h.fmb.middle, back: h.fmb.back },
    })),
  })
}

export function isHoleModel(x: unknown): x is HoleModel {
  try {
    parseHoleModel(x)
    return true
  } catch {
    return false
  }
}
