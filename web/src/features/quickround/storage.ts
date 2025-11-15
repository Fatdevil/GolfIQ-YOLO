import { QuickRound } from "./types";

const STORAGE_KEY = "golfiq.quickRounds.v1";
const HCP_STORAGE_KEY = "golfiq.quickRound.handicap.v1";

export type QuickRoundSummary = Pick<
  QuickRound,
  "id" | "courseName" | "teesName" | "startedAt" | "completedAt"
>;

export function createRoundId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadAllRounds(): QuickRoundSummary[] {
  const rounds = readAllRounds();
  return rounds.map(({ id, courseName, teesName, startedAt, completedAt }) => ({
    id,
    courseName,
    teesName,
    startedAt,
    completedAt,
  }));
}

export function loadAllRoundsFull(): QuickRound[] {
  return readAllRounds();
}

export function loadRound(id: string): QuickRound | null {
  const rounds = readAllRounds();
  return rounds.find((round) => round.id === id) ?? null;
}

export function saveRound(round: QuickRound): void {
  const rounds = readAllRounds();
  const nextRounds = [...rounds.filter((item) => item.id !== round.id), round];
  writeAllRounds(nextRounds);
}

export function upsertRound(round: QuickRound): void {
  saveRound(round);
}

export function deleteRound(id: string): void {
  const rounds = readAllRounds();
  const nextRounds = rounds.filter((round) => round.id !== id);
  writeAllRounds(nextRounds);
}

export function loadDefaultHandicap(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(HCP_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDefaultHandicap(hcp: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(HCP_STORAGE_KEY, String(hcp));
  } catch {
    // ignore
  }
}

export function clearDefaultHandicap(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(HCP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readAllRounds(): QuickRound[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid store");
    }
    return parsed as QuickRound[];
  } catch (error) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (writeError) {
      // ignore write errors
    }
    return [];
  }
}

function writeAllRounds(rounds: QuickRound[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
}
