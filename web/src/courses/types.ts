export type GeoPoint = { lat: number; lon: number };

export type GreenFMB = {
  front: GeoPoint;
  middle: GeoPoint;
  back: GeoPoint;
};

export type Hazard = {
  id: string;
  type: "bunker" | "water" | "rough" | "tree" | "other";
  name?: string;
  polygon?: { rings: GeoPoint[][] };
  center?: GeoPoint;
};

export type HoleBundle = {
  number: number;
  par: number;
  tee_center: GeoPoint;
  green: GreenFMB;
  hazards: Hazard[];
};

export type CourseBundle = {
  id: string;
  name: string;
  country: string;
  holes: HoleBundle[];
  bbox?: GeoPoint[];
  version: number;
};
