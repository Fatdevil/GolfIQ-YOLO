export type CoachTip = {
  id?: string;
  key?: string;
  title?: string;
  detail?: string;
  priority?: number;
  rank?: number;
};

export type UxPayloadV1 = {
  version: string;
  mode: string;
  state: string;
  confidence?: {
    score?: number;
    label?: string;
  } | null;
  hud?: Record<string, unknown> | null;
  explain?: Record<string, unknown> | null;
  coach?: {
    version?: string;
    enabled?: boolean;
    tips?: CoachTip[] | null;
  } | null;
  debug?: Record<string, unknown> | null;
};

function normalizeTips(tips: CoachTip[]): CoachTip[] {
  const shouldSort = tips.some(
    (tip) => tip.rank !== undefined || tip.id || tip.key
  );
  if (!shouldSort) {
    return tips;
  }

  return [...tips].sort((a, b) => {
    const rankA = a.rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const keyA = a.id ?? a.key ?? a.title ?? '';
    const keyB = b.id ?? b.key ?? b.title ?? '';
    return keyA.localeCompare(keyB);
  });
}

export function normalizePayload(payload: UxPayloadV1): UxPayloadV1 {
  const rawTips = Array.isArray(payload.coach?.tips)
    ? payload.coach?.tips ?? []
    : [];
  const normalizedTips = normalizeTips(rawTips).slice(0, 3);

  return {
    ...payload,
    coach: payload.coach
      ? {
          ...payload.coach,
          tips: normalizedTips,
        }
      : {
          version: 'v1',
          enabled: false,
          tips: normalizedTips,
        },
  };
}
