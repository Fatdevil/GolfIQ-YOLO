export type BenchSummaryPlatformConfig = {
  runtime: string;
  inputSize: number;
  quant: string;
  threads: number;
  delegate?: string;
  [key: string]: unknown;
};

export type BenchSummary = Record<string, BenchSummaryPlatformConfig>;

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseBenchSummary(raw: unknown): BenchSummary {
  if (!raw || typeof raw !== "object") {
    throw new Error("bench summary must be an object keyed by platform");
  }
  const summary: BenchSummary = {};
  for (const [platform, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const record = value as Record<string, unknown>;
    const runtime = pickString(record["runtime"]);
    const inputSize = pickNumber(record["inputSize"]);
    const quant = pickString(record["quant"]);
    const threads = pickNumber(record["threads"]);
    const delegate = pickString(record["delegate"]);

    if (!runtime || inputSize === null || !quant || threads === null) {
      continue;
    }

    const config: BenchSummaryPlatformConfig = {
      runtime,
      inputSize,
      quant,
      threads,
    };

    if (delegate) {
      config.delegate = delegate;
    }

    // Preserve any additional metadata.
    for (const [key, extra] of Object.entries(record)) {
      if (!(key in config)) {
        config[key] = extra;
      }
    }

    summary[platform] = config;
  }

  return summary;
}
