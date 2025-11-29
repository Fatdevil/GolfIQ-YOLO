import { ApiError, apiFetch } from '@app/api/client';

export interface RoundSgCategory {
  name: string; // "Off tee", "Approach", "Short game", "Putting"
  strokesGained: number;
}

export interface RoundSgSummary {
  total: number;
  categories: RoundSgCategory[];
}

export type SessionTimelineEventType =
  | 'swing_start'
  | 'impact'
  | 'peak_hips'
  | 'peak_shoulders'
  | 'tempo_marker'
  | 'hole_transition'
  | 'coach_cue'
  | 'mission_event';

export interface SessionTimelineEvent {
  ts: number;
  type: SessionTimelineEventType;
  label?: string | null;
  data?: Record<string, unknown> | null;
}

export interface SessionTimelineResponse {
  runId: string;
  events: SessionTimelineEvent[];
}

export interface CoachRoundSummary {
  strengths: string[];
  focus: string[];
}

type SgCategory = 'TEE' | 'APPROACH' | 'SHORT' | 'PUTT';

interface RoundSgPreviewResponse {
  runId: string;
  total_sg: number;
  sg_by_cat: Record<SgCategory, number>;
}

interface CoachSgCategory {
  name: SgCategory | string;
  sg: number;
}

interface CoachDiagnosisFinding {
  title: string;
  severity: 'info' | 'warning' | 'critical';
}

interface CoachRoundSummaryResponse {
  sg_total?: number | null;
  sg_by_category?: CoachSgCategory[];
  diagnosis?: { findings: CoachDiagnosisFinding[] } | null;
  mission?: { mission_label?: string | null; success?: boolean | null } | null;
}

const SG_CATEGORY_ORDER: SgCategory[] = ['TEE', 'APPROACH', 'SHORT', 'PUTT'];

function labelForCategory(category: SgCategory | string): string {
  switch (category) {
    case 'TEE':
      return 'Off tee';
    case 'APPROACH':
      return 'Approach';
    case 'SHORT':
      return 'Short game';
    case 'PUTT':
      return 'Putting';
    default:
      return category.toString();
  }
}

export async function fetchRoundSg(runId: string): Promise<RoundSgSummary> {
  const response = await apiFetch<RoundSgPreviewResponse>(`/api/sg/run/${runId}`);

  const categories: RoundSgCategory[] = SG_CATEGORY_ORDER.map((key) => ({
    name: labelForCategory(key),
    strokesGained: response.sg_by_cat?.[key] ?? 0,
  }));

  return {
    total: response.total_sg ?? 0,
    categories,
  };
}

export async function fetchSessionTimeline(runId: string): Promise<SessionTimelineResponse> {
  return apiFetch<SessionTimelineResponse>(`/api/session/${runId}/timeline`);
}

function deriveCoachInsights(payload: CoachRoundSummaryResponse): CoachRoundSummary {
  const strengths: string[] = [];
  const focus: string[] = [];

  const categories = payload.sg_by_category ?? [];
  const sortedCategories = [...categories].sort((a, b) => (b?.sg ?? 0) - (a?.sg ?? 0));
  for (const category of sortedCategories.slice(0, 2)) {
    if (typeof category?.sg === 'number' && category.sg > 0.15) {
      const label = labelForCategory(category.name);
      strengths.push(`${label} looking good (+${category.sg.toFixed(1)} SG)`);
    }
  }

  if (strengths.length === 0 && typeof payload.sg_total === 'number') {
    strengths.push(`Total SG ${payload.sg_total >= 0 ? '+' : ''}${payload.sg_total.toFixed(1)}`);
  }

  const findings = payload.diagnosis?.findings ?? [];
  findings
    .filter((finding) => finding.severity === 'warning' || finding.severity === 'critical')
    .slice(0, 2)
    .forEach((finding) => focus.push(finding.title));

  if (focus.length === 0 && categories.length) {
    const worst = [...categories].sort((a, b) => (a?.sg ?? 0) - (b?.sg ?? 0))[0];
    if (worst && typeof worst.sg === 'number') {
      const label = labelForCategory(worst.name);
      focus.push(`Focus on ${label}: ${worst.sg >= 0 ? '+' : ''}${worst.sg.toFixed(1)} SG`);
    }
  }

  if (focus.length === 0 && payload.mission?.success === false) {
    focus.push(`Mission incomplete: ${payload.mission.mission_label ?? 'retry the mission goals'}`);
  }

  if (strengths.length === 0) {
    strengths.push('Solid fundamentals this round.');
  }
  if (focus.length === 0) {
    focus.push('Sharpen tempo and short game consistency.');
  }

  return { strengths, focus };
}

export async function fetchCoachRoundSummary(runId: string): Promise<CoachRoundSummary | null> {
  try {
    const response = await apiFetch<CoachRoundSummaryResponse>(`/api/coach/round-summary/${runId}`);
    return deriveCoachInsights(response);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return null;
    }
    throw err;
  }
}

