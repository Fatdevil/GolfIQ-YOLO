export type HazardRates = {
  water: number;
  bunker: number;
  rough: number;
  ob: number;
  fairway: number;
};

export type HazardLabel = { name: string; rate?: number } | string;

type HazardReason = {
  kind?: string;
  value?: number;
  meta?: { direction?: string } | null;
};

type InferOptions = {
  reasons?: HazardReason[] | null;
  breakdown?: HazardLabel[] | null;
  rates?: HazardRates | null;
};

const SIDE_WEIGHTS = {
  ob: 4,
  water: 3,
  bunker: 2,
  rough: 1,
} as const satisfies Record<string, number>;

const LEFT_REGEX = /(\b|[([\-_])(left|vänster|l)(\b|[\])\-_])/gi;
const RIGHT_REGEX = /(\b|[([\-_])(right|höger|r)(\b|[\])\-_])/gi;

const HAZARD_OB_REGEX = /(\bob\b|out\s*of\s*bounds|boundary|cart\s*path|cartpath)/i;
const HAZARD_WATER_REGEX = /(water|pond|lake|h2o|river|creek)/i;
const HAZARD_BUNKER_REGEX = /(bunker|sand)/i;
const HAZARD_ROUGH_REGEX = /(rough|native|brush|waste)/i;

type Direction = 'left' | 'right';

type DirectionScores = {
  left: number;
  right: number;
};

const DIRECTION_PREFERENCE = {
  word: 1,
  letter: 0.5,
} as const;

const sanitizeRate = (value: unknown): number | undefined => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
};

const normalizeDirection = (value: unknown): Direction | null => {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'left') {
    return 'left';
  }
  if (normalized === 'right') {
    return 'right';
  }
  return null;
};

const detectHazardKind = (label: string): keyof typeof SIDE_WEIGHTS | null => {
  if (HAZARD_OB_REGEX.test(label)) {
    return 'ob';
  }
  if (HAZARD_WATER_REGEX.test(label)) {
    return 'water';
  }
  if (HAZARD_BUNKER_REGEX.test(label)) {
    return 'bunker';
  }
  if (HAZARD_ROUGH_REGEX.test(label)) {
    return 'rough';
  }
  return null;
};

const resolveLabel = (label: HazardLabel | null | undefined): { name: string; rate?: number } | null => {
  if (label == null) {
    return null;
  }
  if (typeof label === 'string') {
    return { name: label };
  }
  if (typeof label.name === 'string') {
    return { name: label.name, rate: sanitizeRate(label.rate) };
  }
  return null;
};

const accumulateDirectionScores = (
  scores: DirectionScores,
  label: string,
  weight: number,
): void => {
  const base = Math.max(0, weight);
  if (!(base > 0)) {
    return;
  }
  let match: RegExpExecArray | null;
  LEFT_REGEX.lastIndex = 0;
  while ((match = LEFT_REGEX.exec(label)) !== null) {
    const token = match[2]?.toLowerCase() ?? '';
    const preference = token.length === 1 ? DIRECTION_PREFERENCE.letter : DIRECTION_PREFERENCE.word;
    scores.left += base * preference;
  }
  RIGHT_REGEX.lastIndex = 0;
  while ((match = RIGHT_REGEX.exec(label)) !== null) {
    const token = match[2]?.toLowerCase() ?? '';
    const preference = token.length === 1 ? DIRECTION_PREFERENCE.letter : DIRECTION_PREFERENCE.word;
    scores.right += base * preference;
  }
};

const resolveLabelWeight = (
  label: string,
  magnitude: number | undefined,
  kindOverride?: keyof typeof SIDE_WEIGHTS | null,
): number => {
  const kind = kindOverride ?? detectHazardKind(label);
  const severity = kind ? SIDE_WEIGHTS[kind] : 1;
  const scaled = magnitude && magnitude > 0 ? magnitude : 1;
  return severity * scaled;
};

export function inferDangerSide(opts: InferOptions): Direction | null {
  const reasonsInput = opts?.reasons ?? null;
  const reasons = Array.isArray(reasonsInput) ? reasonsInput : [];
  let bestDirection: Direction | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const reason of reasons) {
    if (!reason || reason.kind !== 'hazard') {
      continue;
    }
    const direction = normalizeDirection(reason.meta?.direction);
    if (!direction) {
      continue;
    }
    const value = sanitizeRate(reason.value) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestDirection = direction;
    }
  }
  if (bestDirection) {
    return bestDirection;
  }

  const breakdownInput = opts?.breakdown ?? null;
  const breakdown = Array.isArray(breakdownInput) ? breakdownInput : [];
  const rates = opts?.rates ?? null;
  const scores: DirectionScores = { left: 0, right: 0 };

  for (const rawLabel of breakdown) {
    const resolved = resolveLabel(rawLabel);
    if (!resolved) {
      continue;
    }
    const label = resolved.name.trim();
    if (!label) {
      continue;
    }
    const normalized = label.toLowerCase();
    const magnitude = sanitizeRate(resolved.rate);
    const kind = detectHazardKind(normalized);
    const hazardMagnitude = (() => {
      if (!rates || !kind) {
        return magnitude;
      }
      const rateFromHazards = sanitizeRate((rates as Record<string, number>)[kind]);
      if (magnitude && rateFromHazards) {
        return magnitude * rateFromHazards;
      }
      return magnitude ?? rateFromHazards;
    })();

    const weight = resolveLabelWeight(normalized, hazardMagnitude, kind);
    accumulateDirectionScores(scores, normalized, weight);
  }

  const diff = scores.left - scores.right;
  if (Math.abs(diff) < 1e-6) {
    return null;
  }
  return diff > 0 ? 'left' : 'right';
}

export const __test__ = {
  normalizeDirection,
  detectHazardKind,
  resolveLabel,
  accumulateDirectionScores,
  resolveLabelWeight,
};
