export type ClipCommentaryParams = {
  id: string;
  ai_title?: string | null;
  ai_summary?: string | null;
  ai_tts_url?: string | null;
  video_url?: string | null;
};

export type RootStackParamList = {
  PlayerHome: undefined;
  HomeDashboard: undefined;
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
  RangeMissions: undefined;
  RangeQuickPracticeStart: { missionId?: string } | undefined;
  RangeCameraSetup: {
    club: string | null;
    targetDistanceM?: number | null;
    cameraAngle: import('@app/range/rangeSession').RangeCameraAngle;
    missionId?: string;
  };
  RangeQuickPracticeSession: {
    session: import('@app/range/rangeSession').RangeSession;
    missionId?: string;
  };
  RangeQuickPracticeSummary: { summary: import('@app/range/rangeSession').RangeSessionSummary };
  RangeHistory: undefined;
  RangeProgress: undefined;
  RangeSessionDetail: {
    summary: import('@app/range/rangeSession').RangeSessionSummary;
    savedAt?: string;
  };
  RangeTrainingGoal: undefined;
  CaddieApproach: undefined;
  CaddieSetup: undefined;
  MyBag: undefined;
  ClubDistances: undefined;
  Trips: undefined;
  RoundStory: { runId: string; summary?: import('@app/run/lastRound').LastRoundSummary };
  RoundSaved: { summary: import('@app/run/lastRound').LastRoundSummary };
  RoundStart: undefined;
  RoundShot: { roundId?: string } | undefined;
  RoundHistory: undefined;
  PlayerStats: undefined;
  CategoryStats: undefined;
  RoundRecap: { roundId: string };
  RoundSummary: { roundId: string };
  RoundScorecard: { roundId: string };
  CoachReport: { roundId: string; courseName?: string; date?: string };
  WeeklySummary: undefined;
  PracticePlanner: undefined;
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
