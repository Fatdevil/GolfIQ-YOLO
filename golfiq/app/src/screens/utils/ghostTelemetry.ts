export type GhostTelemetryKeyInput = {
  shotId: number;
  range: number;
  lateral: number;
  longErr: number | null;
  latErr: number | null;
};

export function buildGhostTelemetryKey({
  shotId,
  range,
  lateral,
  longErr,
  latErr,
}: GhostTelemetryKeyInput): string {
  return `${shotId}|${range}|${lateral}|${longErr ?? 'null'}|${latErr ?? 'null'}`;
}
