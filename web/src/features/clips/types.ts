export type ClipReactions = {
  counts: Record<string, number>;
  recentCount: number;
  total: number;
};

export interface ShotClip {
  id: string;
  eventId: string;
  playerId: string;
  roundId?: string | null;
  hole?: number | null;
  status: string;
  srcUri?: string | null;
  hlsUrl?: string | null;
  mp4Url?: string | null;
  thumbUrl?: string | null;
  durationMs?: number | null;
  fingerprint?: string | null;
  visibility: string;
  createdAt: string | null;
  reactions: ClipReactions;
  weight: number;
}

export type ClipListResponse = {
  items: ShotClip[];
};

export type ClipReactionRequest = {
  emoji: string;
};
