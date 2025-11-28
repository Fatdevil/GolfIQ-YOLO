import type { RangeShot } from "@/range/types";

export type MissionId =
  | "wedge_ladder_60_100"
  | "approach_band_80_130"
  | "mid_iron_dispersion_130_160"
  | "driver_fairway_challenge";

export type CoachCategory = "tee" | "approach" | "short" | "putt";

export interface RangeMission {
  id: MissionId;
  label: string;
  description: string;
  focusCategory: CoachCategory;
  targetBands: { from: number; to: number }[];
  suggestedClubs?: string[];
  successThreshold?: number;
}

export const RANGE_MISSIONS: RangeMission[] = [
  {
    id: "wedge_ladder_60_100",
    label: "Wedge ladder 60–100 m",
    description: "Hit controlled wedges at 60, 80 and 100 meters.",
    focusCategory: "short",
    targetBands: [
      { from: 55, to: 65 },
      { from: 75, to: 85 },
      { from: 95, to: 105 },
    ],
    suggestedClubs: ["SW", "GW", "PW"],
    successThreshold: 0.6,
  },
  {
    id: "approach_band_80_130",
    label: "Approach band 80–130 m",
    description: "Alternate approaches between 90 and 120 meters to tighten dispersion.",
    focusCategory: "approach",
    targetBands: [
      { from: 85, to: 95 },
      { from: 105, to: 115 },
      { from: 125, to: 135 },
    ],
    suggestedClubs: ["PW", "9i", "8i"],
    successThreshold: 0.55,
  },
  {
    id: "mid_iron_dispersion_130_160",
    label: "Mid-iron dispersion 130–160 m",
    description: "Groove mid-iron carries inside wider target bands.",
    focusCategory: "approach",
    targetBands: [
      { from: 130, to: 140 },
      { from: 145, to: 155 },
      { from: 155, to: 165 },
    ],
    suggestedClubs: ["8i", "7i"],
    successThreshold: 0.5,
  },
  {
    id: "driver_fairway_challenge",
    label: "Driver fairway challenge",
    description: "Keep driver carries inside a generous landing window to simulate fairway hits.",
    focusCategory: "tee",
    targetBands: [{ from: 200, to: 235 }],
    suggestedClubs: ["Driver", "3w"],
    successThreshold: 0.5,
  },
];

export function getMissionById(id: MissionId): RangeMission | undefined {
  return RANGE_MISSIONS.find((mission) => mission.id === id);
}

export function pickMissionForCategory(cat: CoachCategory): RangeMission[] {
  return RANGE_MISSIONS.filter((mission) => mission.focusCategory === cat);
}

function getShotCarry(shot: RangeShot): number | null {
  const anyShot = shot as Record<string, unknown>;
  const direct = typeof anyShot.carry_m === "number" ? (anyShot.carry_m as number) : null;
  const metrics = (anyShot.metrics ?? {}) as Record<string, unknown>;
  const carryM = typeof metrics.carryM === "number" ? (metrics.carryM as number) : null;
  const carryLower = typeof metrics.carry_m === "number" ? (metrics.carry_m as number) : null;
  return direct ?? carryM ?? carryLower ?? null;
}

export type MissionProgress = {
  missionId: MissionId;
  attempts: number;
  hitsInBands: number;
  successRatio: number;
  success: boolean;
  threshold: number;
};

export function computeMissionProgress(
  mission: RangeMission,
  shots: RangeShot[],
): MissionProgress {
  const threshold = mission.successThreshold ?? 0.5;
  let attempts = 0;
  let hitsInBands = 0;

  for (const shot of shots) {
    const carry = getShotCarry(shot);
    if (carry == null) {
      continue;
    }
    attempts += 1;
    const isHit = mission.targetBands.some((band) => carry >= band.from && carry <= band.to);
    if (isHit) {
      hitsInBands += 1;
    }
  }

  const successRatio = attempts > 0 ? hitsInBands / attempts : 0;

  return {
    missionId: mission.id,
    attempts,
    hitsInBands,
    successRatio,
    success: attempts > 0 && successRatio >= threshold,
    threshold,
  };
}

const STORAGE_KEY = "golfiq.range.mission.v2";

export function loadSelectedMissionId(): MissionId | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if ((RANGE_MISSIONS as Array<{ id: string }>).some((mission) => mission.id === raw)) {
      return raw as MissionId;
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
