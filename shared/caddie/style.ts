export type CoachTone = "concise" | "neutral" | "pep";
export type CoachVerbosity = "short" | "normal" | "detailed";
export interface CoachStyle {
  tone: CoachTone;
  verbosity: CoachVerbosity;
  language: "sv" | "en";
  format: "text" | "tts";
  emoji?: boolean;
}

export const defaultCoachStyle: CoachStyle = {
  tone: "neutral",
  verbosity: "normal",
  language: "sv",
  format: "text",
  emoji: false,
};

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

const STORAGE_KEY = "coach.style.v1";

const fallbackStorage = (() => {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  } satisfies AsyncStorageLike;
})();

const VALID_TONES: readonly CoachTone[] = ["concise", "neutral", "pep"];
const VALID_VERBOSITY: readonly CoachVerbosity[] = ["short", "normal", "detailed"];
const VALID_LANGUAGES = ["sv", "en"] as const;
const VALID_FORMATS = ["text", "tts"] as const;

let storagePromise: Promise<AsyncStorageLike> | null = null;
let styleCache: CoachStyle | null | undefined;

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storagePromise) {
    return storagePromise;
  }
  storagePromise = import("@react-native-async-storage/async-storage")
    .then((mod) => {
      const resolved =
        mod && typeof mod === "object" && "default" in mod
          ? (mod.default as AsyncStorageLike)
          : (mod as AsyncStorageLike);
      if (
        resolved &&
        typeof resolved.getItem === "function" &&
        typeof resolved.setItem === "function"
      ) {
        return resolved;
      }
      return fallbackStorage;
    })
    .catch(() => fallbackStorage);
  return storagePromise;
}

function normalizeCoachStyle(value: unknown): CoachStyle | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Partial<CoachStyle>;
  const tone = VALID_TONES.includes(input.tone as CoachTone)
    ? (input.tone as CoachTone)
    : defaultCoachStyle.tone;
  const verbosity = VALID_VERBOSITY.includes(input.verbosity as CoachVerbosity)
    ? (input.verbosity as CoachVerbosity)
    : defaultCoachStyle.verbosity;
  const language = VALID_LANGUAGES.includes(input.language as (typeof VALID_LANGUAGES)[number])
    ? (input.language as CoachStyle["language"])
    : defaultCoachStyle.language;
  const format = VALID_FORMATS.includes(input.format as (typeof VALID_FORMATS)[number])
    ? (input.format as CoachStyle["format"])
    : defaultCoachStyle.format;
  const emoji = input.emoji === true;
  return {
    tone,
    verbosity,
    language,
    format,
    emoji,
  } satisfies CoachStyle;
}

export async function loadCoachStyle(): Promise<CoachStyle> {
  if (styleCache) {
    return { ...styleCache };
  }
  try {
    const storage = await loadStorage();
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeCoachStyle(parsed);
      if (normalized) {
        styleCache = normalized;
        return { ...normalized };
      }
    }
  } catch (error) {
    styleCache = { ...defaultCoachStyle };
    return { ...defaultCoachStyle };
  }
  styleCache = { ...defaultCoachStyle };
  return { ...defaultCoachStyle };
}

export async function saveCoachStyle(style: CoachStyle): Promise<void> {
  const normalized = normalizeCoachStyle(style) ?? { ...defaultCoachStyle };
  styleCache = normalized;
  try {
    const storage = await loadStorage();
    await storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // ignore persistence issues for QA tooling
  }
}

export function __setCoachStyleCacheForTests(style: CoachStyle | null | undefined): void {
  styleCache = style ?? undefined;
}
