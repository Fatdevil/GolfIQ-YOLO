import { apiFetch } from '@app/api/client';
import type { RoundRecap } from '@app/api/roundClient';
import type { RoundStrokesGained } from '@app/api/strokesGainedClient';
import type { WeeklySummary } from '@app/api/weeklySummary';
import type { CoachRoundSummary } from '@app/api/coachClient';

export type DemoRoundResponse = {
  recap: RoundRecap;
  strokesGained?: RoundStrokesGained | null;
};

export async function fetchDemoRoundRecap(): Promise<DemoRoundResponse> {
  const recap = await apiFetch<RoundRecap>('/api/demo/round');
  return { recap };
}

export async function fetchDemoWeeklySummary(): Promise<WeeklySummary> {
  return apiFetch<WeeklySummary>('/api/demo/weekly');
}

export async function fetchDemoCoachRound(): Promise<CoachRoundSummary> {
  return apiFetch<CoachRoundSummary>('/api/demo/coach/round');
}
