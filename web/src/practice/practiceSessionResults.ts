import {
  appendPracticeSessionResult,
  computePracticeSessionProgress,
  normalizePracticeSessionResults,
  type PracticeSessionProgress,
  type PracticeSessionResult,
} from "@shared/practice/practiceSessionResult";

export const PRACTICE_SESSION_RESULTS_KEY = "practiceSessionResults:v1";

const memoryStore = new Map<string, string>();

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  } as Storage;
}

function parse(raw: string | null): PracticeSessionResult[] {
  if (!raw) return [];
  try {
    return normalizePracticeSessionResults(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(history: PracticeSessionResult[]): void {
  try {
    getStorage().setItem(PRACTICE_SESSION_RESULTS_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn("[practiceSessionResults] failed to persist", error);
  }
}

export async function loadPracticeSessionResults(): Promise<PracticeSessionResult[]> {
  try {
    const raw = getStorage().getItem(PRACTICE_SESSION_RESULTS_KEY);
    return parse(raw);
  } catch {
    return [];
  }
}

export async function appendPracticeSessionResultEntry(
  result: PracticeSessionResult,
): Promise<PracticeSessionResult[]> {
  const history = await loadPracticeSessionResults();
  const next = appendPracticeSessionResult(history, result);
  if (next !== history) {
    persist(next);
  }
  return next;
}

export async function summarizePracticeSessionProgress(now = new Date()): Promise<PracticeSessionProgress> {
  const history = await loadPracticeSessionResults();
  return computePracticeSessionProgress(history, now);
}

export function clearPracticeSessionResultsForTests(): void {
  try {
    getStorage().removeItem(PRACTICE_SESSION_RESULTS_KEY);
  } catch {
    // ignore
  }
}
