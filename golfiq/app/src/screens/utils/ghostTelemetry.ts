export type GhostTelemetryMetrics = {
  shotId: string | number;
  range: number;
  lateral: number;
  longErr: number | null;
  latErr: number | null;
};

const formatNullable = (value: number | null, fractionDigits: number) => {
  if (value === null) {
    return 'null';
  }
  return value.toFixed(fractionDigits);
};

export function buildGhostTelemetryKey({
  shotId,
  range,
  lateral,
  longErr,
  latErr,
}: GhostTelemetryMetrics): string {
  const shot = String(shotId);
  const formattedRange = range.toFixed(1);
  const formattedLateral = lateral.toFixed(2);
  const formattedLongErr = formatNullable(longErr, 2);
  const formattedLatErr = formatNullable(latErr, 2);

  return `${shot}|${formattedRange}|${formattedLateral}|${formattedLongErr}|${formattedLatErr}`;
}
