import type { RangeShot } from "@/range/types";

export type MissionId =
  | "fairway-finder"
  | "wedge-ladder"
  | "stock-yardage";

export type Mission = {
  id: MissionId;
  name: string;
  description: string;
  target_m: number | null;
  tolerance_m: number | null;
  targetReps: number;
};

export type MissionProgress = {
  missionId: MissionId;
  goodReps: number;
  totalShots: number;
};

export const RANGE_MISSIONS: Mission[] = [
  {
    id: "fairway-finder",
    name: "Fairway Finder",
    description:
      "Hit controlled drives inside a corridor around your target distance.",
    target_m: 210,
    tolerance_m: 15,
    targetReps: 10,
  },
  {
    id: "wedge-ladder",
    name: "Wedge Ladder",
    description:
      "Alternate between wedge distances and land within a tight window.",
    target_m: 70,
    tolerance_m: 10,
    targetReps: 12,
  },
  {
    id: "stock-yardage",
    name: "Stock Yardage Check",
    description: "Confirm your stock distance for a chosen club.",
    target_m: null,
    tolerance_m: null,
    targetReps: 8,
  },
];

export function getMissionById(id: MissionId): Mission | undefined {
  return RANGE_MISSIONS.find((m) => m.id === id);
}

function getShotCarry(shot: RangeShot): number | null {
  const carry =
    (shot as any).carry_m ??
    (shot as any).metrics?.carry_m ??
    (shot as any).metrics?.carryM ??
    null;
  return typeof carry === "number" && carry > 0 ? carry : null;
}

export function computeMissionProgress(
  mission: Mission,
  shots: RangeShot[]
): MissionProgress {
  const carries = shots
    .map(getShotCarry)
    .filter((v): v is number => v !== null);

  let goodReps = 0;
  const totalShots = carries.length;

  if (totalShots === 0) {
    return { missionId: mission.id, goodReps: 0, totalShots: 0 };
  }

  if (mission.id === "stock-yardage") {
    const mean = carries.reduce((sum, v) => sum + v, 0) / totalShots;
    const tolerance = 7;
    for (const c of carries) {
      if (Math.abs(c - mean) <= tolerance) {
        goodReps++;
      }
    }
  } else if (mission.target_m != null && mission.tolerance_m != null) {
    for (const c of carries) {
      const err = Math.abs(c - mission.target_m);
      if (err <= mission.tolerance_m) {
        goodReps++;
      }
    }
  }

  return { missionId: mission.id, goodReps, totalShots };
}

export function grooveFillPercent(
  mission: Mission,
  progress: MissionProgress
): number {
  if (mission.targetReps <= 0) {
    return 0;
  }
  const ratio = progress.goodReps / mission.targetReps;
  const pct = Math.round(ratio * 100);
  return Math.max(0, Math.min(100, pct));
}

const STORAGE_KEY = "golfiq.range.mission.v1";

export function loadSelectedMissionId(): MissionId | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (
      raw === "fairway-finder" ||
      raw === "wedge-ladder" ||
      raw === "stock-yardage"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSelectedMissionId(id: MissionId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function clearSelectedMissionId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
