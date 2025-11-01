export type Point = { x: number; y: number }

export type Polygon = Point[]

export type FMb = { front: Point; middle: Point; back: Point }

export interface HoleRef {
  id: string
  fmb: FMb
}

export interface HoleModel {
  id: string
  version?: number
  holes: HoleRef[]
}
