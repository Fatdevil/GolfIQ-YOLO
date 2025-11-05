export type UUID = string;

export type Event = {
  id: UUID;
  name: string;
  start_at?: string;
  code: string;
  status?: 'open' | 'closed';
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
  ts: string;
};

export type LeaderboardRow = {
  user_id: UUID;
  display_name: string;
  holes: number;
  gross: number;
  net: number;
  to_par: number;
  last_ts?: string;
};
