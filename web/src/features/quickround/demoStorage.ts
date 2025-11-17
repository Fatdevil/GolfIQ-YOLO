import type { QuickRound } from "./types";

export const QUICK_ROUNDS_STORAGE_KEY = "golfiq.quickRounds.v1";

const defaultDemoRounds: QuickRound[] = [
  {
    id: "demo-qr-1",
    courseName: "Willow Creek 9",
    teesName: "Yellow",
    holes: [
      { index: 1, par: 4, strokes: 5 },
      { index: 2, par: 4, strokes: 4 },
      { index: 3, par: 3, strokes: 3 },
      { index: 4, par: 4, strokes: 5 },
      { index: 5, par: 5, strokes: 6 },
      { index: 6, par: 4, strokes: 4 },
      { index: 7, par: 3, strokes: 3 },
      { index: 8, par: 4, strokes: 4 },
      { index: 9, par: 4, strokes: 5 },
    ],
    startedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
    handicap: 10,
  },
  {
    id: "demo-qr-2",
    courseName: "Lakeside Park",
    teesName: "Blue",
    holes: [
      { index: 1, par: 4, strokes: 4 },
      { index: 2, par: 4, strokes: 4 },
      { index: 3, par: 3, strokes: 3 },
      { index: 4, par: 4, strokes: 4 },
      { index: 5, par: 5, strokes: 5 },
      { index: 6, par: 4, strokes: 4 },
      { index: 7, par: 3, strokes: 3 },
      { index: 8, par: 4, strokes: 4 },
      { index: 9, par: 4, strokes: 4 },
    ],
    startedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 90 * 60 * 1000).toISOString(),
    handicap: 8,
  },
  {
    id: "demo-qr-3",
    courseName: "City Links",
    teesName: "White",
    holes: [
      { index: 1, par: 4, strokes: 6 },
      { index: 2, par: 4, strokes: 5 },
      { index: 3, par: 3, strokes: 4 },
      { index: 4, par: 4, strokes: 5 },
      { index: 5, par: 5, strokes: 6 },
      { index: 6, par: 4, strokes: 5 },
      { index: 7, par: 3, strokes: 4 },
      { index: 8, par: 4, strokes: 5 },
      { index: 9, par: 4, strokes: 5 },
    ],
    startedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 80 * 60 * 1000).toISOString(),
    handicap: 12,
  },
];

export function saveQuickRoundsDemo(rounds: QuickRound[] = defaultDemoRounds): void {
  try {
    window.localStorage.setItem(QUICK_ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
  } catch {
    // ignore
  }
}
