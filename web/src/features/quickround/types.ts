export type QuickHole = {
  index: number;
  par: number;
  strokes?: number;
  putts?: number;
};

export type QuickRound = {
  id: string;
  runId?: string;
  courseName?: string;
  courseId?: string;
  teesName?: string;
  holes: QuickHole[];
  startHole?: number;
  startedAt: string;
  completedAt?: string;
  showPutts?: boolean;
  handicap?: number;
  memberId?: string | null;
  strokesGainedLight?: import("@shared/stats/strokesGainedLight").StrokesGainedLightSummary | null;
  strokesGainedLightTrend?: import("@shared/stats/strokesGainedLight").StrokesGainedLightTrend | null;
  strokesGainedLightRounds?: Array<
    import("@shared/stats/strokesGainedLight").StrokesGainedLightSummary & { roundId?: string; playedAt?: string }
  >;
};
