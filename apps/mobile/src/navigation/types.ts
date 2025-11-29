export type ClipCommentaryParams = {
  id: string;
  ai_title?: string | null;
  ai_summary?: string | null;
  ai_tts_url?: string | null;
  video_url?: string | null;
};

export type RootStackParamList = {
  PlayerHome: undefined;
  PlayRoundSetup: undefined;
  RangePractice: undefined;
  Trips: undefined;
  EventJoin: { code?: string } | undefined;
  EventLive: {
    id: string;
    role?: 'admin' | 'spectator' | 'player' | 'host';
    clip?: ClipCommentaryParams | null;
    tournamentSafe?: boolean;
    coachMode?: boolean;
  };
  EventScan: undefined;
};
