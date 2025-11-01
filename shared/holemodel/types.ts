export interface Point {
  lat: number
  lon: number
}

export interface BoundingBox {
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
}

export type Polygon = Point[]

export interface HoleModel {
  id: string
  bbox: BoundingBox
  fairways: Polygon[]
  greens: Polygon[]
  bunkers: Polygon[]
  pin?: Point
}
