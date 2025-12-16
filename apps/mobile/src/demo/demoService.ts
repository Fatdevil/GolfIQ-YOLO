import { apiFetch } from '@app/api/client';
import type { RoundRecap } from '@app/api/roundClient';
import type { RoundStrokesGained } from '@app/api/strokesGainedClient';
import type { WeeklySummary } from '@app/api/weeklySummaryClient';
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
  const payload = await apiFetch<any>('/api/demo/weekly');

  if (!payload) {
    return {
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      roundsPlayed: 0,
      holesPlayed: 0,
      focusHints: [],
    };
  }

  return {
    startDate: payload.period?.from ?? new Date().toISOString(),
    endDate: payload.period?.to ?? new Date().toISOString(),
    roundsPlayed: payload.period?.roundCount ?? 0,
    holesPlayed: payload.coreStats?.holesPlayed ?? 0,
    highlight: payload.coreStats?.bestScore
      ? { label: 'Best round', value: `${payload.coreStats.bestScore}` }
      : undefined,
    focusHints: Array.isArray(payload.focusHints) ? payload.focusHints : [],
  } satisfies WeeklySummary;
}

export async function fetchDemoCoachRound(): Promise<CoachRoundSummary> {
  return apiFetch<CoachRoundSummary>('/api/demo/coach/round');
}
