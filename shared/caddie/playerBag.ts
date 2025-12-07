export type PlayerBagClub = {
  clubId: string;
  label: string;
  avgCarryM: number | null;
  stdDevM?: number | null;
  sampleCount: number;
  active: boolean;
  manualAvgCarryM?: number | null;
};

export type PlayerBag = {
  clubs: PlayerBagClub[];
};
