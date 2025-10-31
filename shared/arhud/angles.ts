export const TAU = Math.PI * 2;

function mod(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

export function wrapRad(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  const wrapped = mod(angle + Math.PI, TAU) - Math.PI;
  return wrapped <= -Math.PI ? wrapped + TAU : wrapped;
}

export function diffRad(a: number, b: number): number {
  return wrapRad(a - b);
}

export function deg(angleRad: number): number {
  if (!Number.isFinite(angleRad)) {
    return 0;
  }
  return (angleRad * 180) / Math.PI;
}

export function rad(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    return 0;
  }
  return (angleDeg * Math.PI) / 180;
}

export function slerpYaw(a: number, b: number, t: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(1, t));
  const delta = diffRad(b, a);
  return wrapRad(a + delta * clamped);
}
