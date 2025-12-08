import type { RangeMission } from "@/features/range/missions";
import type { RangeShot } from "@/range/types";
import { recordPracticeMissionOutcome } from "@/practice/practiceMissionHistory";
import type { PracticeMissionOutcome } from "@shared/practice/practiceHistory";

export type MissionSessionMeta = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  missionTargetReps?: number | null;
};

export async function persistMissionOutcomeFromSession(
  mission: RangeMission | null,
  shots: RangeShot[],
  meta: MissionSessionMeta,
): Promise<void> {
  if (!mission || !mission.suggestedClubs?.length) return;

  const suggestedClubs = mission.suggestedClubs;

  const completedTargetShots = shots.filter((shot) => {
    const club = shot.clubId ?? shot.club;
    return typeof club === "string" && suggestedClubs.includes(club);
  }).length;

  if (completedTargetShots <= 0) return;

  const outcome: PracticeMissionOutcome = {
    missionId: mission.id,
    sessionId: meta.sessionId,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    targetSampleCount: meta.missionTargetReps ?? undefined,
    targetClubs: mission.suggestedClubs,
    completedSampleCount: completedTargetShots,
  };

  try {
    await recordPracticeMissionOutcome(outcome);
  } catch (err) {
    console.warn("[practice] Failed to persist practice mission session", err);
  }
}
