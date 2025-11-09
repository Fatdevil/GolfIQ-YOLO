export type EventId = string & { __brand: 'EventId' };
export type ShortCode = string & { __brand: 'ShortCode' };
export type MemberRole = 'admin' | 'player' | 'spectator';

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

export type LiveSpectatorEvent = {
  id: UUID;
  name: string;
  status?: string | null;
  format: ScoringFormat;
  allowancePct?: number | null;
};

export type LiveSpectatorPlayer = {
  id: string;
  name: string;
  gross: number;
  net?: number | null;
  stableford?: number | null;
  toPar?: number | null;
  thru: number;
  lastUpdated?: string | null;
  playingHandicap?: number | null;
  whsIndex?: number | null;
};

export type LiveSpectatorShot = {
  id: string;
  hole: number;
  seq: number;
  club?: string | null;
  carry?: number | null;
  playsLikePct?: number | null;
  strokesGained?: number | null;
  updatedAt?: string | null;
};

export type LiveSpectatorSnapshot = {
  event: LiveSpectatorEvent;
  players: LiveSpectatorPlayer[];
  topShots: LiveSpectatorShot[];
  updatedAt: string | null;
  format: ScoringFormat;
};

export type SpectatorBoardPlayer = {
  name: string;
  gross: number;
  net?: number | null;
  thru: number;
  hole: number;
  status?: string | null;
};
