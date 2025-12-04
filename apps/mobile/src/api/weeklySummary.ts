import { apiFetch } from './client';

export type WeeklySummaryCategory = {
  grade: string | null;
  trend: 'up' | 'down' | 'flat' | null;
  note: string | null;
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
  focusHints: string[];
};

export async function fetchWeeklySummary(): Promise<WeeklySummary> {
  return apiFetch<WeeklySummary>('/api/player/summary/weekly');
}
