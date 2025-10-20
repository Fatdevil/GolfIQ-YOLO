export interface Shot {
  club: string;
  carry_m: number;
  notes?: string;
}

export interface CalibOut {
  suggested: Record<string, number>;
  usedShots: number;
  perClub: Record<string, { n: number; median: number; mad: number }>;
}

function sanitizeCarry(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : null;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mad(values: number[], center: number): number {
  if (!values.length) {
    return 0;
  }
  const deviations = values.map((value) => Math.abs(value - center));
  return median(deviations);
}

export function calibrate(shots: Shot[], minN = 5): CalibOut {
  const suggested: Record<string, number> = {};
  const perClub: Record<string, { n: number; median: number; mad: number }> = {};
  let usedShots = 0;

  const grouped = new Map<string, number[]>();
  for (const shot of shots) {
    if (!shot || typeof shot.club !== "string") {
      continue;
    }
    const normalizedClub = shot.club.trim();
    if (!normalizedClub) {
      continue;
    }
    const carry = sanitizeCarry(shot.carry_m);
    if (carry === null) {
      continue;
    }
    if (!grouped.has(normalizedClub)) {
      grouped.set(normalizedClub, []);
    }
    grouped.get(normalizedClub)!.push(carry);
  }

  grouped.forEach((values, club) => {
    if (values.length < minN) {
      return;
    }
    const center = median(values);
    const spread = mad(values, center);
    const threshold = spread === 0 ? 0 : 2.5 * spread;
    const filtered = values.filter((value) => Math.abs(value - center) <= threshold);
    if (!filtered.length) {
      return;
    }
    const filteredMedian = median(filtered);
    const filteredMad = mad(filtered, filteredMedian);
    const rounded = Math.round(filteredMedian);
    suggested[club] = rounded;
    perClub[club] = { n: filtered.length, median: filteredMedian, mad: filteredMad };
    usedShots += filtered.length;
  });

  return { suggested, usedShots, perClub };
}
