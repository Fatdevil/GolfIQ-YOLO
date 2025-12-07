export type DistanceUnit = 'metric' | 'imperial';

export function convertMeters(valueM: number | null | undefined, unit: DistanceUnit = 'metric'): number | null {
  if (valueM == null || !Number.isFinite(valueM)) return null;
  if (unit === 'metric') return valueM;
  return valueM * 1.0936133;
}

export function formatDistance(
  valueM: number | null | undefined,
  options: { unit?: DistanceUnit; withUnit?: boolean } = {},
): string {
  const { unit = 'metric', withUnit = false } = options;
  const converted = convertMeters(valueM, unit);
  if (converted == null) return '–';
  const rounded = Math.round(converted);
  const suffix = withUnit ? (unit === 'metric' ? ' m' : ' yd') : '';
  return `${rounded}${suffix}`;
}
