import { getItem, setItem } from '@app/storage/asyncStorage';
import {
  appendPracticeSessionResult,
  computePracticeSessionProgress,
  normalizePracticeSessionResults,
  type PracticeSessionProgress,
  type PracticeSessionResult,
} from '@shared/practice/practiceSessionResult';

export const PRACTICE_SESSION_RESULTS_KEY = 'practiceSessionResults:v1';

function parse(raw: string | null): PracticeSessionResult[] {
  if (!raw) return [];
  try {
    return normalizePracticeSessionResults(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function persist(history: PracticeSessionResult[]): Promise<void> {
  try {
    await setItem(PRACTICE_SESSION_RESULTS_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('[practiceSessionResults] failed to persist', error);
  }
}

export async function loadPracticeSessionResults(): Promise<PracticeSessionResult[]> {
  const raw = await getItem(PRACTICE_SESSION_RESULTS_KEY);
  return parse(raw);
}

export async function appendPracticeSessionResultEntry(
  result: PracticeSessionResult,
): Promise<PracticeSessionResult[]> {
  const history = await loadPracticeSessionResults();
  const next = appendPracticeSessionResult(history, result);
  if (next !== history) {
    await persist(next);
  }
  return next;
}

export async function summarizePracticeSessionProgress(now = new Date()): Promise<PracticeSessionProgress> {
  const history = await loadPracticeSessionResults();
  return computePracticeSessionProgress(history, now);
}
