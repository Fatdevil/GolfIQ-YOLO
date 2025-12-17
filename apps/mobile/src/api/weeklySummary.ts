import { apiFetch } from './client';
import type { WeeklyFocusHint } from './weeklySummaryClient';

export type WeeklySummaryCategory = {
  grade: string | null;
  trend: 'up' | 'down' | 'flat' | null;
  note: string | null;
};

export type WeeklyStrokesGainedCategory = {
  value: number;
  grade: string | null;
  label?: string | null;
};

export type WeeklyStrokesGained = {
  total: number;
  categories: {
    driving?: WeeklyStrokesGainedCategory;
    approach?: WeeklyStrokesGainedCategory;
    short_game?: WeeklyStrokesGainedCategory;
    putting?: WeeklyStrokesGainedCategory;
  };
};

export type WeeklySummary = {
  period: {
    from: string;
    to: string;
    roundCount: number;
  };
  headline: {
    text: string;
    emoji?: string;
  };
  coreStats: {
    avgScore: number | null;
    bestScore: number | null;
    worstScore: number | null;
    avgToPar: string | null;
    holesPlayed: number | null;
  };
  categories: {
    driving?: WeeklySummaryCategory;
    approach?: WeeklySummaryCategory;
    short_game?: WeeklySummaryCategory;
    putting?: WeeklySummaryCategory;
  };
  focusHints: WeeklyFocusHint[];
  strokesGained?: WeeklyStrokesGained | null;
};

export async function fetchWeeklySummary(): Promise<WeeklySummary> {
  return apiFetch<WeeklySummary>('/api/player/summary/weekly');
}
