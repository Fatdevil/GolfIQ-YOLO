import { apiFetch } from './client';

export type StrokesGainedCategory = {
  value: number;
  label: string;
  grade: string;
  comment: string;
};

export type RoundStrokesGained = {
  roundId: string;
  total: number;
  categories: {
    driving?: StrokesGainedCategory;
    approach?: StrokesGainedCategory;
    short_game?: StrokesGainedCategory;
    putting?: StrokesGainedCategory;
  };
};

export async function fetchRoundStrokesGained(roundId: string): Promise<RoundStrokesGained> {
  return apiFetch<RoundStrokesGained>(`/api/rounds/${roundId}/strokes-gained`);
}
