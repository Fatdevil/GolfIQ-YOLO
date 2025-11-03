export const fmtMeters = (n: number): string => `${Math.round(n)} m`;

export const fmtPct = (p: number): string => `${Math.round(p * 100)}%`;

export const nz = (v: number | undefined, d = 0): number =>
  Number.isFinite(v as number) ? (v as number) : d;
