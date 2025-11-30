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

const MAX_HIGHLIGHTS = 5;

function formatSeconds(ts: number): string {
  return `${ts.toFixed(2)}s`;
}

function describeEvent(event: SessionTimelineEvent): string {
  switch (event.type) {
    case 'peak_hips':
      return 'Smooth hip speed through the swing';
    case 'peak_shoulders':
      return 'Solid shoulder rotation';
    case 'impact':
      return event.label ? `${event.label}` : 'Clean contact recorded';
    case 'tempo_marker': {
      const total = Number(event.data?.total_s);
      if (!Number.isNaN(total)) {
        return `Tempo check: ${total.toFixed(2)}s`;
      }
      return `Tempo marker at ${formatSeconds(event.ts)}`;
    }
    case 'hole_transition': {
      const from = event.data?.from_hole;
      const to = event.data?.to_hole;
      if (typeof from === 'number' && typeof to === 'number') {
        return `Hole ${from} → ${to}`;
      }
      return event.label ?? 'Next hole on deck';
    }
    case 'coach_cue':
      return event.label ? `Coach cue: ${event.label}` : 'Coach cue noted';
    case 'mission_event':
      return event.label ?? 'Mission update';
    case 'swing_start':
    default:
      return event.label ?? `${event.type.replace('_', ' ')} at ${formatSeconds(event.ts)}`;
  }
}

export function buildHighlights(events: SessionTimelineEvent[], maxItems = MAX_HIGHLIGHTS): string[] {
  const highlights: string[] = [];
  for (const event of events) {
    if (highlights.length >= maxItems) break;
    const description = describeEvent(event);
    if (description) {
      highlights.push(description);
    }
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
  const strengths = params.isPro ? (params.coach?.strengths ?? []).slice(0, 2) : [];
  const focus = params.isPro ? (params.coach?.focus ?? []).slice(0, 2) : [];

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

