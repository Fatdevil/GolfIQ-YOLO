export type TeeRating = {
  id: string;
  name: string;
  nine?: 'front' | 'back' | '18';
  slope: number;
  rating: number;
  par: number;
  strokeIndex?: number[];
};

export type HandicapSetup = {
  handicapIndex: number;
  tee: TeeRating;
  allowancePct: number;
};
