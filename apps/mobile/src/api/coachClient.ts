import { ApiError, apiFetch } from '@app/api/client';

export type CoachRecommendedDrill = {
  id: string;
  name: string;
  category: string;
};

export type CoachRoundSummary = {
  roundId: string;
  courseName?: string | null;
  date?: string | null;
  headline: string;
  score: number | null;
  toPar: string | null;
  strokesGained?: {
    total: number | null;
    driving?: number | null;
    approach?: number | null;
    shortGame?: number | null;
    putting?: number | null;
  };
  focus: string[];
  recommendedDrills?: CoachRecommendedDrill[];
};

export class ProRequiredError extends Error {
  status?: number;
}

type CoachRoundSummaryResponse = {
  run_id: string;
  course_name?: string | null;
  tees?: string | null;
  date?: string | null;
  score?: number | null;
  sg_total?: number | null;
  sg_by_category?: Array<{ name: string; sg: number | null }>;
  recommendedDrills?: CoachRecommendedDrill[];
  diagnosis?: {
    findings: Array<{
      title?: string | null;
      message?: string | null;
      severity?: 'info' | 'warning' | 'critical';
      category?: string | null;
      suggested_focus?: string[];
      suggested_missions?: string[];
    }>;
  } | null;
  mission?: { mission_id?: string | null; mission_label?: string | null } | null;
};

const CATEGORY_MAP: Record<string, keyof NonNullable<CoachRoundSummary['strokesGained']>> = {
  tee: 'driving',
  approach: 'approach',
  short: 'shortGame',
  putt: 'putting',
};

function deriveHeadline(payload: CoachRoundSummaryResponse): string {
  const firstFinding = payload.diagnosis?.findings?.[0];
  if (firstFinding?.title) return firstFinding.title;
  if (typeof payload.sg_total === 'number') {
    const formatted = payload.sg_total >= 0 ? `+${payload.sg_total.toFixed(1)}` : payload.sg_total.toFixed(1);
    return `Coach takeaway: ${formatted} SG total`;
  }
  return 'Coach report';
}

function deriveFocus(payload: CoachRoundSummaryResponse): string[] {
  const focus: string[] = [];
  const findings = payload.diagnosis?.findings ?? [];

  findings.forEach((finding) => {
    const suggestions = finding.suggested_focus ?? [];
    if (suggestions.length) {
      focus.push(...suggestions);
    } else if (finding.message) {
      focus.push(finding.message);
    } else if (finding.title) {
      focus.push(finding.title);
    }
  });

  if (!focus.length && payload.sg_by_category?.length) {
    const worst = [...payload.sg_by_category].sort((a, b) => (a?.sg ?? 0) - (b?.sg ?? 0))[0];
    if (worst && typeof worst.sg === 'number') {
      focus.push(`Focus on ${worst.name}: ${worst.sg >= 0 ? '+' : ''}${worst.sg.toFixed(1)} SG`);
    }
  }

  return focus.slice(0, 4);
}

function deriveRecommendedDrills(payload: CoachRoundSummaryResponse): CoachRoundSummary['recommendedDrills'] {
  if (payload.recommendedDrills?.length) return payload.recommendedDrills;

  const drills: NonNullable<CoachRoundSummary['recommendedDrills']> = [];
  const seen = new Set<string>();

  payload.diagnosis?.findings?.forEach((finding) => {
    (finding.suggested_missions ?? []).forEach((missionId) => {
      if (seen.has(missionId)) return;
      drills.push({ id: missionId, name: missionId.replace(/_/g, ' '), category: finding.category ?? 'focus' });
      seen.add(missionId);
    });
  });

  const missionId = payload.mission?.mission_id;
  const missionLabel = payload.mission?.mission_label;
  if ((missionId || missionLabel) && !seen.has(missionId ?? missionLabel ?? '')) {
    drills.push({ id: missionId ?? missionLabel ?? 'mission', name: missionLabel ?? 'Suggested mission', category: 'mission' });
  }

  return drills;
}

function mapStrokes(payload: CoachRoundSummaryResponse): CoachRoundSummary['strokesGained'] {
  const categories = payload.sg_by_category ?? [];
  const mapped: NonNullable<CoachRoundSummary['strokesGained']> = {
    total: payload.sg_total ?? null,
  };

  categories.forEach((category) => {
    const key = CATEGORY_MAP[category.name.toLowerCase()] ?? null;
    if (key) {
      mapped[key] = category.sg ?? null;
    }
  });

  return mapped;
}

export async function fetchCoachRoundSummary(roundId: string): Promise<CoachRoundSummary> {
  try {
    const response = await apiFetch<CoachRoundSummaryResponse>(`/api/coach/round-summary/${roundId}`);
    return {
      roundId: response.run_id,
      courseName: response.course_name,
      date: response.date,
      headline: deriveHeadline(response),
      score: response.score ?? null,
      toPar: null,
      strokesGained: mapStrokes(response),
      focus: deriveFocus(response),
      recommendedDrills: deriveRecommendedDrills(response),
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 402 || err.status === 403)) {
      const proError = new ProRequiredError('Coach report requires GolfIQ Pro');
      proError.status = err.status;
      throw proError;
    }
    throw err;
  }
}
