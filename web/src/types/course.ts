export type LatLon = { lat: number; lon: number };

export type HoleLayout = {
  number: number; // 1–18
  tee: LatLon; // center of tee box
  green: LatLon; // center of green
};

export type CourseLayout = {
  id: string;
  name: string;
  holes: HoleLayout[];
};
