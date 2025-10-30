export function headingToUnit(heading_deg: number): { x: number; y: number } {
  if (!Number.isFinite(heading_deg)) {
    return { x: 0, y: 1 };
  }
  const headingRad = (Number(heading_deg) * Math.PI) / 180;
  const x = Math.sin(headingRad);
  const y = Math.cos(headingRad);
  return { x, y };
}

export function windAlongHeading(
  wind: { x: number; y: number } | null | undefined,
  heading_deg: number,
): number {
  if (!wind || !Number.isFinite(wind.x) || !Number.isFinite(wind.y)) {
    return 0;
  }
  const unit = headingToUnit(heading_deg);
  const along = -(Number(wind.x) * unit.x + Number(wind.y) * unit.y);
  if (!Number.isFinite(along)) {
    return 0;
  }
  return along;
}
