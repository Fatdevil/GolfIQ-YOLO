import { type HoleModel, type Point, type Polygon, type BoundingBox } from './types.js'

type ValidationError = { path: string; message: string }

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPoint = (value: unknown): value is Point =>
  typeof value === 'object' && value !== null &&
  isNumber((value as Point).lat) && isNumber((value as Point).lon)

const isBoundingBox = (value: unknown): value is BoundingBox => {
  if (typeof value !== 'object' || value === null) return false
  const bbox = value as BoundingBox
  return (
    isNumber(bbox.minLat) &&
    isNumber(bbox.minLon) &&
    isNumber(bbox.maxLat) &&
    isNumber(bbox.maxLon) &&
    bbox.minLat <= bbox.maxLat &&
    bbox.minLon <= bbox.maxLon
  )
}

const isPolygon = (value: unknown): value is Polygon =>
  Array.isArray(value) && value.length >= 3 && value.every(isPoint)

const assert = (condition: boolean, error: ValidationError): void => {
  if (!condition) {
    const err = new Error(`${error.path}: ${error.message}`)
    err.name = 'HoleModelValidationError'
    throw err
  }
}

export const parseHoleModel = (input: string | object): HoleModel => {
  let data: unknown
  if (typeof input === 'string') {
    data = JSON.parse(input)
  } else {
    data = input
  }

  assert(typeof data === 'object' && data !== null, { path: 'root', message: 'expected object' })
  const model = data as Record<string, unknown>

  const id = model.id
  assert(typeof id === 'string' && id.length > 0, {
    path: 'id',
    message: 'expected non-empty string',
  })

  const bbox = model.bbox
  assert(isBoundingBox(bbox), { path: 'bbox', message: 'invalid bounding box' })

  const parsePolygonArray = (value: unknown, path: string): Polygon[] => {
    assert(Array.isArray(value), { path, message: 'expected array' })
    return (value as unknown[]).map((polygon, index) => {
      assert(isPolygon(polygon), { path: `${path}[${index}]`, message: 'invalid polygon' })
      return (polygon as Polygon).map((point) => ({ ...point }))
    })
  }

  const fairways = parsePolygonArray(model.fairways, 'fairways')
  const greens = parsePolygonArray(model.greens, 'greens')
  const bunkers = parsePolygonArray(model.bunkers, 'bunkers')

  let pin: Point | undefined
  if (model.pin !== undefined) {
    assert(isPoint(model.pin), { path: 'pin', message: 'invalid point' })
    pin = { ...(model.pin as Point) }
  }

  return {
    id,
    bbox: { ...(bbox as BoundingBox) },
    fairways,
    greens,
    bunkers,
    pin,
  }
}

export const serializeHoleModel = (model: HoleModel): string => JSON.stringify(model)
