import type { CaddieDecisionOutput } from '@app/caddie/CaddieDecisionEngine';
import type { CaddieSettings } from '@app/caddie/caddieSettingsStorage';
import type { CaddieHudPayload } from '@app/watch/caddieHudBridge';

interface HudContext {
  roundId?: string;
  holeNumber?: number;
  par?: number | null;
  rawDistanceM: number;
}

interface HudExtras {
  strategy?: 'attack' | 'layup';
  targetDistanceM?: number | null;
  recommendedClubId?: string | null;
}

export function buildCaddieHudPayload(
  decision: CaddieDecisionOutput,
  settings: CaddieSettings,
  context?: HudContext,
  extras?: HudExtras,
): CaddieHudPayload {
  return {
    roundId: context?.roundId,
    holeNumber: context?.holeNumber,
    par: context?.par ?? null,
    rawDistanceM: context?.rawDistanceM ?? decision.playsLikeDistanceM,
    playsLikeDistanceM: decision.playsLikeDistanceM,
    slopeAdjustM: decision.playsLikeBreakdown.slopeAdjustM,
    windAdjustM: decision.playsLikeBreakdown.windAdjustM,
    club: decision.club,
    intent: decision.intent,
    riskProfile: settings.riskProfile,
    strategy: extras?.strategy,
    targetDistanceM: extras?.targetDistanceM,
    recommendedClubId: extras?.recommendedClubId ?? decision.club,
    coreCarryMinM: decision.risk.coreZone.carryMinM,
    coreCarryMaxM: decision.risk.coreZone.carryMaxM,
    coreSideMinM: decision.risk.coreZone.sideMinM,
    coreSideMaxM: decision.risk.coreZone.sideMaxM,
    tailLeftProb: decision.risk.tailLeftProb,
    tailRightProb: decision.risk.tailRightProb,
  };
}
