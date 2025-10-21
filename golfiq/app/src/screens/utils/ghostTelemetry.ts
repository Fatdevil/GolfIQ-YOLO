export function buildGhostTelemetryKey(p: {
  shotId: number;
  range: number;
  lateral: number;
  longErr: number | null;
  latErr: number | null;
}): string {
  const { shotId, range, lateral, longErr, latErr } = p;
  const f = (x: number | null, n = 2) => (x == null ? 'null' : x.toFixed(n));
  return [shotId, range.toFixed(1), lateral.toFixed(2), f(longErr), f(latErr)].join('|');
}
