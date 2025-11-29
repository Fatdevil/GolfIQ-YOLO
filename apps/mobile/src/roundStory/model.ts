import type { CoachRoundSummary, RoundSgSummary, SessionTimelineEvent } from '@app/api/roundStory';
import type { LastRoundSummary } from '@app/run/lastRound';

export interface RoundStoryViewModel {
  runId: string;
  courseName: string;
  teeName: string;
  holes: number;
  totalStrokes: number;
  relativeToPar?: string;

  sg?: RoundSgSummary;
  highlights: string[];
  strengths: string[];
  focus: string[];
}

function formatSeconds(ts: number): string {
  return `${ts.toFixed(2)}s`;
}

function describeEvent(event: SessionTimelineEvent): string {
  switch (event.type) {
    case 'peak_hips':
      return `Hips peak at ${formatSeconds(event.ts)}`;
    case 'peak_shoulders':
      return `Shoulders peak at ${formatSeconds(event.ts)}`;
    case 'impact':
      return event.label ? `${event.label} (${formatSeconds(event.ts)})` : `Impact at ${formatSeconds(event.ts)}`;
    case 'tempo_marker': {
      const total = Number(event.data?.total_s);
      if (!Number.isNaN(total)) {
        return `Tempo recorded: ${total.toFixed(2)}s`;
      }
      return `Tempo marker at ${formatSeconds(event.ts)}`;
    }
    case 'hole_transition': {
      const from = event.data?.from_hole;
      const to = event.data?.to_hole;
      if (typeof from === 'number' && typeof to === 'number') {
        return `Hole ${from} → Hole ${to}`;
      }
      return event.label ?? 'Hole transition';
    }
    case 'coach_cue':
      return event.label ? `Coach cue: ${event.label}` : 'Coach cue shown';
    case 'mission_event':
      return event.label ?? 'Mission event';
    case 'swing_start':
    default:
      return event.label ?? `${event.type.replace('_', ' ')} at ${formatSeconds(event.ts)}`;
  }
}

export function buildHighlights(events: SessionTimelineEvent[], maxItems = 6): string[] {
  const highlights: string[] = [];
  for (const event of events) {
    if (highlights.length >= maxItems) break;
    highlights.push(describeEvent(event));
  }
  return highlights;
}

export function buildRoundStoryViewModel(params: {
  runId: string;
  summary?: LastRoundSummary | null;
  sg?: RoundSgSummary | null;
  highlights?: string[];
  coach?: CoachRoundSummary | null;
  isPro: boolean;
}): RoundStoryViewModel {
  const baseSummary = params.summary;
  const strengths = params.isPro ? params.coach?.strengths ?? [] : [];
  const focus = params.isPro ? params.coach?.focus ?? [] : [];

  return {
    runId: params.runId,
    courseName: baseSummary?.courseName ?? 'Round',
    teeName: baseSummary?.teeName ?? 'Tee',
    holes: baseSummary?.holes ?? 0,
    totalStrokes: baseSummary?.totalStrokes ?? 0,
    relativeToPar: baseSummary?.relativeToPar,
    sg: params.isPro ? params.sg ?? undefined : undefined,
    highlights: params.isPro ? params.highlights ?? [] : [],
    strengths,
    focus,
  };
}

