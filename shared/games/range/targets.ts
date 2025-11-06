import type { RingTarget } from './types';

export function buildTargets(baseCarries_m: number[], lateralSpread_m = 0): RingTarget[] {
  return baseCarries_m.map((c, i) => ({
    id: `t${i}`,
    label: `${Math.round(c)}m`,
    carry_m: c,
    radius_m: Math.max(4, Math.min(10, Math.round(c * 0.03))),
    center: { x: c, y: (i % 2 ? lateralSpread_m : -lateralSpread_m) },
  }));
}

export function isHit(target: RingTarget, p: { x: number; y: number }): boolean {
  const dx = p.x - target.center.x;
  const dy = p.y - target.center.y;
  return dx * dx + dy * dy <= target.radius_m * target.radius_m;
}
