import type { PracticeRecommendationContext } from '@shared/practice/practiceRecommendationsAnalytics';
import type { StrokesGainedLightCategory } from '@shared/stats/strokesGainedLight';

export type ClipCommentaryParams = {
  id: string;
  ai_title?: string | null;
  ai_summary?: string | null;
  ai_tts_url?: string | null;
  video_url?: string | null;
};

export type QuickPracticeEntrySource = 'range_home' | 'recap' | 'missions' | 'other';

export type RootStackParamList = {
  Onboarding: undefined;
  DemoExperience: undefined;
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
  RangeQuickPracticeStart:
    | {
        missionId?: string;
        practiceRecommendation?: import('@shared/caddie/bagPracticeRecommendations').BagPracticeRecommendation;
        entrySource?: QuickPracticeEntrySource;
        practiceRecommendationContext?: PracticeRecommendationContext;
      }
    | undefined;
  RangeCameraSetup: {
    club: string | null;
    targetDistanceM?: number | null;
    cameraAngle: import('@app/range/rangeSession').RangeCameraAngle;
    missionId?: string;
    practiceRecommendation?: import('@shared/caddie/bagPracticeRecommendations').BagPracticeRecommendation;
    entrySource?: QuickPracticeEntrySource;
    practiceRecommendationContext?: PracticeRecommendationContext;
  };
  RangeQuickPracticeSession: {
    session: import('@app/range/rangeSession').RangeSession;
    missionId?: string;
    practiceRecommendation?: import('@shared/caddie/bagPracticeRecommendations').BagPracticeRecommendation;
    entrySource?: QuickPracticeEntrySource;
    practiceRecommendationContext?: PracticeRecommendationContext;
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
  RoundRecap: { roundId: string; isDemo?: boolean };
  RoundSummary: { roundId: string };
  RoundScorecard: { roundId: string };
  CoachReport: { roundId: string; courseName?: string; date?: string; isDemo?: boolean };
  WeeklySummary: { isDemo?: boolean } | undefined;
  PracticePlanner:
    | {
        maxMinutes?: number;
        focusCategories?: string[];
        focusDrillIds?: string[];
      }
    | undefined;
  PracticeSession: undefined;
  PracticeMissions:
    | {
        source?:
          | 'home'
          | 'other'
          | 'round_recap_sg_light'
          | 'mobile_home_sg_light_focus'
          | 'mobile_stats_sg_light_trend'
          | 'mobile_round_story_sg_light_focus';
        practiceRecommendationSource?:
          | 'home'
          | 'other'
          | 'round_recap_sg_light'
          | 'mobile_home_sg_light_focus'
          | 'mobile_stats_sg_light_trend'
          | 'mobile_round_story_sg_light_focus';
        strokesGainedLightFocusCategory?: StrokesGainedLightCategory;
      }
    | undefined;
  WeeklyPracticeGoalSettings: undefined;
  PracticeHistory: undefined;
  PracticeMissionDetail: { entryId: string };
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
