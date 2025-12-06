import { describe, expect, it } from 'vitest';

import { buildCaddieHudPayload } from '@app/caddie/caddieHudMapper';
import type { CaddieDecisionOutput } from '@app/caddie/CaddieDecisionEngine';

describe('buildCaddieHudPayload', () => {
  it('maps decision output and settings to HUD payload', () => {
    const decision: CaddieDecisionOutput = {
      club: '7i',
      intent: 'fade',
      effectiveCarryM: 154,
      playsLikeDistanceM: 152,
      playsLikeBreakdown: { slopeAdjustM: -2, windAdjustM: 1 },
      source: 'auto',
      samples: 8,
      risk: {
        coreZone: {
          carryMinM: 145,
          carryMaxM: 159,
          sideMinM: -6,
          sideMaxM: 5,
        },
        fullZone: {
          carryMinM: 140,
          carryMaxM: 164,
          sideMinM: -9,
          sideMaxM: 8,
        },
        tailLeftProb: 0.04,
        tailRightProb: 0.02,
      },
    };

    const payload = buildCaddieHudPayload(decision, { stockShape: 'straight', riskProfile: 'aggressive' }, {
      roundId: 'round-1',
      holeNumber: 5,
      par: 4,
      rawDistanceM: 148,
    });

    expect(payload).toEqual({
      roundId: 'round-1',
      holeNumber: 5,
      par: 4,
      rawDistanceM: 148,
      playsLikeDistanceM: 152,
      slopeAdjustM: -2,
      windAdjustM: 1,
      club: '7i',
      intent: 'fade',
      riskProfile: 'aggressive',
      strategy: undefined,
      targetDistanceM: undefined,
      recommendedClubId: '7i',
      coreCarryMinM: 145,
      coreCarryMaxM: 159,
      coreSideMinM: -6,
      coreSideMaxM: 5,
      tailLeftProb: 0.04,
      tailRightProb: 0.02,
    });
  });
});
