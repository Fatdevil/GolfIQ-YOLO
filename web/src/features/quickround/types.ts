export type QuickHole = {
  index: number;
  par: number;
  strokes?: number;
  putts?: number;
};

export type QuickRound = {
  id: string;
  courseName: string;
  teesName?: string;
  holes: QuickHole[];
  startedAt: string;
  completedAt?: string;
  showPutts?: boolean;
};
