import { type HoleModel, type Point, type Polygon } from './types.js'

const sqDist = (a: Point, b: Point): number => {
  const dLat = a.lat - b.lat
  const dLon = a.lon - b.lon
  return dLat * dLat + dLon * dLon
}

const sqSegDist = (p: Point, a: Point, b: Point): number => {
  if (a.lat === b.lat && a.lon === b.lon) return sqDist(p, a)

  const t =
    ((p.lat - a.lat) * (b.lat - a.lat) + (p.lon - a.lon) * (b.lon - a.lon)) /
    (sqDist(b, a))
  const clamped = Math.max(0, Math.min(1, t))

  const proj: Point = {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lon: a.lon + (b.lon - a.lon) * clamped,
  }
  return sqDist(p, proj)
}

const simplifyDP = (points: Point[], sqTolerance: number): Point[] => {
  const last = points.length - 1
  const stack: Array<{ first: number; last: number }> = [{ first: 0, last }]
  const markers = new Uint8Array(points.length)
  markers[0] = 1
  markers[last] = 1

  while (stack.length > 0) {
    const { first, last } = stack.pop()!
    let maxSqDist = 0
    let index = first

    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last])
      if (sq > maxSqDist) {
        index = i
        maxSqDist = sq
      }
    }

    if (maxSqDist > sqTolerance) {
      markers[index] = 1
      stack.push({ first, last: index })
      stack.push({ first: index, last })
    }
  }

  const simplified: Point[] = []
  markers.forEach((flag, index) => {
    if (flag) simplified.push(points[index])
  })
  return simplified
}

const simplifyRadialDistance = (points: Point[], sqTolerance: number): Point[] => {
  if (points.length <= 2) return points.slice()
  let prev = points[0]
  const newPoints = [prev]

  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    if (sqDist(point, prev) > sqTolerance) {
      newPoints.push(point)
      prev = point
    }
  }

  if (prev !== points[points.length - 1]) {
    newPoints.push(points[points.length - 1])
  }

  return newPoints
}

export const simplifyPolygon = (polygon: Polygon, tolerance = 1e-6): Polygon => {
  if (polygon.length <= 3) return polygon.slice()
  const sqTolerance = tolerance * tolerance
  const radial = simplifyRadialDistance(polygon, sqTolerance)
  return simplifyDP(radial, sqTolerance)
}

export const simplifyHoleModel = (model: HoleModel, tolerance = 1e-6): HoleModel => ({
  ...model,
  fairways: model.fairways.map((p) => simplifyPolygon(p, tolerance)),
  greens: model.greens.map((p) => simplifyPolygon(p, tolerance)),
  bunkers: model.bunkers.map((p) => simplifyPolygon(p, tolerance)),
})
