import { computeQuickRoundSummary } from "@/features/quickround/summary";
import type { QuickRound } from "@/features/quickround/types";
import type { MissionId } from "@/features/range/missions";
import type { RangeSession } from "@/features/range/sessions";

export type InsightKind = "strength" | "focus";

export type Insight = {
  id: string;
  kind: InsightKind;
};

export type InsightsInput = {
  rounds: QuickRound[];
  rangeSessions: RangeSession[];
};

export type InsightsResult = {
  strengths: Insight[];
  focuses: Insight[];
  suggestedMission: MissionId | null;
};

const GOOD_NET_TO_PAR_THRESHOLD = -2;
const HIGH_TO_PAR_THRESHOLD = 15;
const CONSISTENT_CARRY_STD_THRESHOLD = 7;
const HIGH_HIT_RATE_THRESHOLD = 70;
const MIN_ROUNDS_FOR_ANALYSIS = 3;
const MIN_RANGE_SESSION_SHOTS = 10;
const MIN_RANGE_SAMPLE = 3;
const MISSION_LOW_COMPLETION = 0.4;

function getMissionCompletionRatio(session: RangeSession): number | null {
  if (
    session.missionId &&
    session.missionGoodReps != null &&
    session.missionTargetReps != null &&
    session.missionTargetReps > 0
  ) {
    return session.missionGoodReps / session.missionTargetReps;
  }
  return null;
}

function averageRatioForMission(
  sessions: RangeSession[],
  missionId: MissionId
): number | null {
  const relevant = sessions
    .filter((s) => s.missionId === missionId)
    .map((s) => getMissionCompletionRatio(s))
    .filter((ratio): ratio is number => ratio != null);
  if (relevant.length === 0) {
    return null;
  }
  return relevant.reduce((sum, value) => sum + value, 0) / relevant.length;
}

export function computeInsights(input: InsightsInput): InsightsResult {
  const strengths: Insight[] = [];
  const focuses: Insight[] = [];
  let suggestedMission: MissionId | null = null;

  const rounds = Array.isArray(input.rounds) ? input.rounds : [];
  const rangeSessions = Array.isArray(input.rangeSessions) ? input.rangeSessions : [];

  const completedRounds = rounds.filter((round) => Boolean(round.completedAt));
  const roundCount = completedRounds.length;

  if (roundCount >= MIN_ROUNDS_FOR_ANALYSIS) {
    const summaries = completedRounds.map((round) => computeQuickRoundSummary(round));
    const threshold = Math.max(1, Math.ceil(roundCount / 3));

    const goodRounds = summaries.filter(
      (summary) => summary.netToPar != null && summary.netToPar <= GOOD_NET_TO_PAR_THRESHOLD
    );
    if (goodRounds.length >= threshold) {
      strengths.push({ id: "rounds.good_net_scoring", kind: "strength" });
    }

    const volatileRounds = summaries.filter(
      (summary) => summary.toPar != null && summary.toPar >= HIGH_TO_PAR_THRESHOLD
    );
    if (volatileRounds.length >= threshold) {
      focuses.push({ id: "rounds.high_variance", kind: "focus" });
    }
  }

  const recentSessions = rangeSessions.slice(0, 10);
  if (recentSessions.length > 0) {
    const consistentCarrySessions = recentSessions.filter(
      (session) =>
        session.carryStd_m != null &&
        session.carryStd_m < CONSISTENT_CARRY_STD_THRESHOLD &&
        session.shotCount >= MIN_RANGE_SESSION_SHOTS
    );
    if (consistentCarrySessions.length >= MIN_RANGE_SAMPLE) {
      strengths.push({ id: "range.consistent_carry", kind: "strength" });
    }

    const highHitSessions = recentSessions.filter(
      (session) =>
        session.hitRate_pct != null &&
        session.hitRate_pct >= HIGH_HIT_RATE_THRESHOLD &&
        session.shotCount >= MIN_RANGE_SESSION_SHOTS
    );
    if (highHitSessions.length >= MIN_RANGE_SAMPLE) {
      strengths.push({ id: "range.good_hit_rate", kind: "strength" });
    }

    const lowMissionSessions = recentSessions.filter((session) => {
      const ratio = getMissionCompletionRatio(session);
      return ratio != null && ratio < MISSION_LOW_COMPLETION && session.shotCount >= MIN_RANGE_SESSION_SHOTS;
    });
    if (lowMissionSessions.length >= 2) {
      focuses.push({ id: "range.mission_completion_low", kind: "focus" });
    }

    const wedgeMissionRatio = averageRatioForMission(recentSessions, "wedge-ladder");
    if (wedgeMissionRatio != null && wedgeMissionRatio < 1) {
      suggestedMission = "wedge-ladder";
    }

    if (!suggestedMission) {
      const fairwayMissionRatio = averageRatioForMission(recentSessions, "fairway-finder");
      if (fairwayMissionRatio != null && fairwayMissionRatio < 1) {
        suggestedMission = "fairway-finder";
      }
    }

    if (!suggestedMission) {
      const stockMissionRatio = averageRatioForMission(recentSessions, "stock-yardage");
      if (stockMissionRatio != null && stockMissionRatio < 1) {
        suggestedMission = "stock-yardage";
      }
    }

    if (!suggestedMission) {
      suggestedMission = recentSessions.find((session) => session.missionId)?.missionId ?? null;
    }

    if (!suggestedMission && recentSessions.length > 0) {
      suggestedMission = "wedge-ladder";
    }
  }

  return {
    strengths: strengths.slice(0, 3),
    focuses: focuses.slice(0, 3),
    suggestedMission,
  };
}
