export type ClipCommentaryParams = {
  id: string;
  ai_title?: string | null;
  ai_summary?: string | null;
  ai_tts_url?: string | null;
  video_url?: string | null;
};

export type RootStackParamList = {
  PlayerHome: undefined;
  PlayCourseSelect: undefined;
  PlayTeeSelect: { courseId: string; courseName: string; tees?: { id: string; name: string; lengthMeters?: number }[] };
  PlayInRound: {
    courseId?: string;
    courseName?: string;
    teeId?: string;
    teeName?: string;
    bundle?: import('@app/api/courses').CourseBundle;
  } | undefined;
  PlayRoundSetup: undefined;
  RangePractice: undefined;
  RangeQuickPracticeStart: undefined;
  RangeCameraSetup: {
    club: string | null;
    targetDistanceM?: number | null;
    cameraAngle: import('@app/range/rangeSession').RangeCameraAngle;
  };
  RangeQuickPracticeSession: { session: import('@app/range/rangeSession').RangeSession };
  Trips: undefined;
  RoundStory: { runId: string; summary?: import('@app/run/lastRound').LastRoundSummary };
  RoundSaved: { summary: import('@app/run/lastRound').LastRoundSummary };
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
