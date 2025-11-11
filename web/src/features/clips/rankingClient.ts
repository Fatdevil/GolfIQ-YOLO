import { sgTopShotsAlpha, sgTopShotsBeta, sgTopShotsGamma } from '@web/config';

import type { ClipWithMetrics, TopShotClip } from './metricsApi';

type Coefficients = {
  alpha?: number;
  beta?: number;
  gamma?: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCreatedAt(clip: ClipWithMetrics): number | null {
  const raw = (clip.createdAt ?? clip.created_at) as string | undefined;
  if (!raw) return null;
  const date = new Date(raw);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function minutesSince(timestampMs: number | null, nowMs: number): number | null {
  if (timestampMs === null) return null;
  const deltaMs = nowMs - timestampMs;
  const minutes = deltaMs / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutes;
}

export function rankTopShotsClient(
  clips: ClipWithMetrics[],
  nowMs = Date.now(),
  coefficients: Coefficients = {},
): TopShotClip[] {
  const alpha = coefficients.alpha ?? sgTopShotsAlpha;
  const beta = coefficients.beta ?? sgTopShotsBeta;
  const gamma = coefficients.gamma ?? sgTopShotsGamma;

  const scored = clips.map((clip) => {
    const reactions1m =
      toNumber((clip as Record<string, unknown>).reactions_1min ?? (clip as Record<string, unknown>).reactions1min ?? 0);
    const reactionsTotal =
      toNumber((clip as Record<string, unknown>).reactions_total ?? (clip as Record<string, unknown>).reactionsTotal ?? 0);
    const sgDelta = toNumber(clip.sgDelta ?? clip.sg_delta ?? 0, 0);
    const createdAt = parseCreatedAt(clip);
    const minutes = minutesSince(createdAt, nowMs);
    const recencyComponent = minutes === null ? 0 : gamma * (1 / minutes);
    const score = reactions1m + alpha * Math.log1p(Math.max(0, reactionsTotal)) + beta * sgDelta + recencyComponent;
    return { ...clip, score } as TopShotClip;
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const createdA = parseCreatedAt(a) ?? 0;
    const createdB = parseCreatedAt(b) ?? 0;
    return createdB - createdA;
  });
}
