function fallbackHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}:${input.length.toString(16).padStart(4, '0')}`;
}

function stringifyPrimitive(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  const json = JSON.stringify(value);
  return typeof json === 'string' ? json : 'null';
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return stringifyPrimitive(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${stringifyPrimitive(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export type ScoreFingerprintInput = {
  scorecardId: string;
  hole: number;
  strokes: number;
  putts?: number | null;
  revision: number;
};

export function scoreFingerprint(input: ScoreFingerprintInput): string {
  const raw = stableStringify({
    s: input.scorecardId,
    h: input.hole,
    st: input.strokes,
    p: input.putts ?? null,
    r: input.revision,
  });

  return fallbackHash(raw);
}
