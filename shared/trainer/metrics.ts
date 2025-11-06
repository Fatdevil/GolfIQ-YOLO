import { type GoldenMetric, type GoldenMetricKey } from './types';

const BASELINE_LOFT: Record<string, number> = {
  driver: 10.5,
  dr: 10.5,
  '1w': 10.5,
  '3w': 15,
  '4w': 16.5,
  '5w': 18,
  '7w': 21,
  hybrid: 22,
  '2h': 18,
  '3h': 20,
  '4h': 22,
  '5h': 25,
  '2i': 18,
  '3i': 20,
  '4i': 22,
  '5i': 25,
  '6i': 28,
  '7i': 32,
  '8i': 36,
  '9i': 40,
  pw: 45,
  aw: 50,
  gw: 50,
  sw: 54,
  lw: 58,
  uw: 48,
  putter: 3,
};

const GOLDEN_LABELS: Record<GoldenMetricKey, { label: string; unit?: string }> = {
  startLine: { label: 'Start line', unit: '°' },
  faceToPathIdx: { label: 'Face-to-path', unit: 'idx' },
  tempo: { label: 'Tempo', unit: '×' },
  lowPointSign: { label: 'Low point', unit: '' },
  launchProxy: { label: 'Launch', unit: '°' },
  dynLoftProxy: { label: 'Dyn. loft', unit: '°' },
};

type MetricQuality = 'good' | 'ok' | 'poor';

type ClubFamily = 'wood' | 'midIron' | 'wedge';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    return 0;
  }
  let normalized = ((angleDeg + 180) % 360) - 180;
  if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

function resolveClubKey(club?: string): string {
  if (!club) {
    return '';
  }
  return club.trim().toLowerCase();
}

function resolveClubFamily(club?: string): ClubFamily {
  const key = resolveClubKey(club);
  if (!key) {
    return 'midIron';
  }
  if (key.includes('driver') || key.endsWith('dr') || key.endsWith('1w') || key.includes('wood') || /^\d+w$/.test(key)) {
    return 'wood';
  }
  if (key.includes('wedge') || /[pgls]w$/.test(key)) {
    return 'wedge';
  }
  return 'midIron';
}

function getBaselineLoft(club?: string): number {
  const key = resolveClubKey(club);
  if (!key) {
    return 24;
  }
  if (key in BASELINE_LOFT) {
    return BASELINE_LOFT[key];
  }
  const trimmed = key.replace(/\s+/g, '');
  if (trimmed in BASELINE_LOFT) {
    return BASELINE_LOFT[trimmed];
  }
  if (trimmed.endsWith('i')) {
    const num = Number(trimmed.replace(/[^0-9]/g, ''));
    if (Number.isFinite(num) && num >= 3 && num <= 9) {
      return 18 + (num - 3) * 4;
    }
  }
  return 24;
}

function qualityForStartLine(startDeg?: number): MetricQuality {
  const absVal = Math.abs(Number(startDeg ?? Number.NaN));
  if (!Number.isFinite(absVal)) {
    return 'ok';
  }
  if (absVal <= 1) {
    return 'good';
  }
  if (absVal <= 2.5) {
    return 'ok';
  }
  return 'poor';
}

function computeFaceToPath(startDeg?: number, lateralSign?: number): {
  value: number;
  quality: MetricQuality;
} {
  const start = Number(startDeg);
  const lateral = Number(lateralSign);
  const hasStart = Number.isFinite(start);
  const hasLateral = Number.isFinite(lateral);
  const direction = hasLateral && lateral !== 0 ? Math.sign(lateral) : hasStart ? Math.sign(start) : 0;
  const combined = hasStart ? start * (direction || 0) : 0;
  const normalized = clamp(hasStart ? combined / 10 : 0, -1, 1);
  const magnitude = Math.abs(normalized);
  let quality: MetricQuality = 'ok';
  if (!hasStart) {
    quality = 'ok';
  } else if (magnitude <= 0.2) {
    quality = 'good';
  } else if (magnitude <= 0.5) {
    quality = 'ok';
  } else {
    quality = 'poor';
  }
  return { value: normalized, quality };
}

function qualityForTempo(ratio?: number): MetricQuality {
  if (!Number.isFinite(ratio)) {
    return 'ok';
  }
  const diff = Math.abs(Number(ratio) - 3);
  if (diff <= 0.6) {
    return 'good';
  }
  if (diff <= 1) {
    return 'ok';
  }
  return 'poor';
}

function formatTempoValue(ratio?: number): number {
  if (!Number.isFinite(ratio)) {
    return 3;
  }
  return Number(ratio);
}

function qualityForLowPoint(sign?: number): MetricQuality {
  if (!Number.isFinite(sign)) {
    return 'ok';
  }
  const normalized = Math.sign(Number(sign));
  if (normalized <= -1) {
    return 'good';
  }
  if (normalized === 0) {
    return 'ok';
  }
  return 'poor';
}

function normalizedLowPoint(sign?: number): number {
  if (!Number.isFinite(sign)) {
    return 0;
  }
  const normalized = Math.sign(Number(sign));
  return normalized === 0 ? 0 : normalized < 0 ? -1 : 1;
}

function qualityForLaunch(family: ClubFamily, launchDeg?: number): MetricQuality {
  if (!Number.isFinite(launchDeg)) {
    return 'ok';
  }
  const value = Number(launchDeg);
  switch (family) {
    case 'wood':
      if (value >= 7 && value <= 12) {
        return 'good';
      }
      if (value >= 5 && value <= 14) {
        return 'ok';
      }
      return 'poor';
    case 'wedge':
      if (value >= 28 && value <= 36) {
        return 'good';
      }
      if (value >= 24 && value <= 40) {
        return 'ok';
      }
      return 'poor';
    case 'midIron':
    default:
      if (value >= 18 && value <= 22) {
        return 'good';
      }
      if (value >= 15 && value <= 25) {
        return 'ok';
      }
      return 'poor';
  }
}

function sanitizeLaunchValue(launchDeg?: number, family?: ClubFamily): number {
  if (Number.isFinite(launchDeg)) {
    return Number(launchDeg);
  }
  switch (family) {
    case 'wood':
      return 10;
    case 'wedge':
      return 32;
    case 'midIron':
    default:
      return 20;
  }
}

function qualityForDynLoft(delta: number): MetricQuality {
  const absVal = Math.abs(delta);
  if (absVal <= 2) {
    return 'good';
  }
  if (absVal <= 5) {
    return 'ok';
  }
  return 'poor';
}

export function computeGolden6(input: {
  club?: string;
  startDeg?: number;
  lateralSign?: number;
  launchDeg?: number;
  aoaSign?: number;
  tempoRatio?: number;
}): GoldenMetric[] {
  const { club, startDeg, lateralSign, launchDeg, aoaSign, tempoRatio } = input ?? {};
  const family = resolveClubFamily(club);
  const startValue = Number.isFinite(startDeg) ? normalizeAngle(Number(startDeg)) : 0;
  const startQuality = qualityForStartLine(startDeg);

  const { value: faceValue, quality: faceQuality } = computeFaceToPath(startDeg, lateralSign);
  const tempoValue = formatTempoValue(tempoRatio);
  const tempoQuality = qualityForTempo(tempoRatio);
  const lowPointValue = normalizedLowPoint(aoaSign);
  const lowPointQuality = qualityForLowPoint(aoaSign);
  const launchValue = sanitizeLaunchValue(launchDeg, family);
  const launchQuality = qualityForLaunch(family, launchDeg);
  const baselineLoft = getBaselineLoft(club);
  const dynLoftValue = launchValue - baselineLoft;
  const dynLoftQuality = qualityForDynLoft(dynLoftValue);

  const metrics: GoldenMetric[] = [
    {
      key: 'startLine',
      label: GOLDEN_LABELS.startLine.label,
      unit: GOLDEN_LABELS.startLine.unit,
      value: Number.parseFloat(startValue.toFixed(1)),
      quality: startQuality,
    },
    {
      key: 'faceToPathIdx',
      label: GOLDEN_LABELS.faceToPathIdx.label,
      unit: GOLDEN_LABELS.faceToPathIdx.unit,
      value: Number.parseFloat(faceValue.toFixed(2)),
      quality: faceQuality,
    },
    {
      key: 'tempo',
      label: GOLDEN_LABELS.tempo.label,
      unit: GOLDEN_LABELS.tempo.unit,
      value: Number.parseFloat(tempoValue.toFixed(2)),
      quality: tempoQuality,
    },
    {
      key: 'lowPointSign',
      label: GOLDEN_LABELS.lowPointSign.label,
      unit: GOLDEN_LABELS.lowPointSign.unit,
      value: lowPointValue,
      quality: lowPointQuality,
    },
    {
      key: 'launchProxy',
      label: GOLDEN_LABELS.launchProxy.label,
      unit: GOLDEN_LABELS.launchProxy.unit,
      value: Number.parseFloat(launchValue.toFixed(1)),
      quality: launchQuality,
    },
    {
      key: 'dynLoftProxy',
      label: GOLDEN_LABELS.dynLoftProxy.label,
      unit: GOLDEN_LABELS.dynLoftProxy.unit,
      value: Number.parseFloat(dynLoftValue.toFixed(1)),
      quality: dynLoftQuality,
    },
  ];

  return metrics;
}
