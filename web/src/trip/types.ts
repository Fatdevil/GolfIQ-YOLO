export type TripPlayer = {
  id: string;
  name: string;
};

export type TripHoleScore = {
  hole: number;
  player_id: string;
  strokes?: number;
  putts?: number;
};

export type TripRound = {
  id: string;
  created_ts: number;
  course_id?: string | null;
  course_name: string;
  tees_name?: string | null;
  holes: number;
  players: TripPlayer[];
  scores: TripHoleScore[];
  public_token?: string | null;
};
