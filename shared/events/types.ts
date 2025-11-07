export type UUID = string;

export type ScoringFormat = 'stroke' | 'stableford';

export type EventSettings = {
  scoringFormat: ScoringFormat;
  allowancePct?: number;
};

export type Event = {
  id: UUID;
  name: string;
  start_at?: string;
  code: string;
  status?: 'open' | 'closed';
  settings?: EventSettings | null;
};

export type Participant = {
  event_id: UUID;
  user_id: UUID;
  display_name: string;
  hcp_index?: number | null;
  round_id?: UUID | null;
};

export type ScoreRow = {
  event_id: UUID;
  user_id: UUID;
  hole_no: number;
  gross: number;
  net: number;
  to_par: number;
  par?: number | null;
  strokes_received?: number | null;
  stableford?: number | null;
  playing_handicap?: number | null;
  course_handicap?: number | null;
  format?: ScoringFormat | null;
  ts: string;
  round_revision?: number | null;
  scores_hash?: string | null;
};

export type LeaderboardRow = {
  user_id: UUID;
  display_name: string;
  holes: number;
  gross: number;
  net: number;
  toPar: number;
  to_par?: number;
  last_ts?: string;
  stableford?: number;
  hasStableford: boolean;
  playing_handicap?: number | null;
  format?: ScoringFormat;
};
