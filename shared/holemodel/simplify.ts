import { type HoleModel, type Point, type Polygon } from './types.js'

const sqDist = (a: Point, b: Point): number => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

const sqSegDist = (p: Point, a: Point, b: Point): number => {
  if (a.x === b.x && a.y === b.y) return sqDist(p, a)

  const denom = sqDist(b, a)
  const t =
    ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
    (denom === 0 ? 1 : denom)
  const clamped = Math.max(0, Math.min(1, t))

  const proj: Point = {
    x: a.x + (b.x - a.x) * clamped,
    y: a.y + (b.y - a.y) * clamped,
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
  holes: model.holes.map((hole) => ({
    ...hole,
    fmb: {
      front: { ...hole.fmb.front },
      middle: { ...hole.fmb.middle },
      back: { ...hole.fmb.back },
    },
  })),
})
