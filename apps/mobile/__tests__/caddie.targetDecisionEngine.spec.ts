import { describe, expect, it } from 'vitest';

import { type PlayerBag } from '@app/api/bagClient';
import { computeCaddieDecision, normalizeRiskPreference } from '@app/caddie/caddieDecisionEngine';
import type { HoleCaddieTargets } from '@shared/round/autoHoleCore';

const bag: PlayerBag = {
  clubs: [
    { clubId: 'D', label: 'Driver', avgCarryM: 240, sampleCount: 10, active: true },
    { clubId: '3W', label: '3 Wood', avgCarryM: 215, sampleCount: 8, active: true },
    { clubId: '5i', label: '5 Iron', avgCarryM: 170, sampleCount: 6, active: true },
    { clubId: '8i', label: '8 Iron', avgCarryM: 140, sampleCount: 5, active: true },
  ],
};

const targets: HoleCaddieTargets = {
  holeNumber: 1,
  green: {
    type: 'green',
    holeNumber: 1,
    position: { lat: 0, lon: 0 },
    description: 'Center green',
    carryDistanceM: 320,
  },
  layup: {
    type: 'layup',
    holeNumber: 1,
    position: { lat: 0, lon: 0 },
    description: 'Fairway layup',
    carryDistanceM: 210,
  },
};

const playsLikePlusTen = (distance: number) => distance + 10;

describe('caddieDecisionEngine (target-aware)', () => {
  it('chooses layup for safe player on long par 5', () => {
    const decision = computeCaddieDecision({
      holeNumber: 1,
      holePar: 5,
      holeYardageM: 480,
      targets,
      playerBag: bag,
      riskPreference: 'safe',
      playsLikeDistanceFn: playsLikePlusTen,
      elevationDiffM: 0,
      wind: { speedMps: 0, angleDeg: 0 },
    });

    expect(decision?.strategy).toBe('layup');
    expect(decision?.targetType).toBe('layup');
    expect(decision?.recommendedClubId).toBe('3W');
  });

  it('attacks green for aggressive short par 4', () => {
    const decision = computeCaddieDecision({
      holeNumber: 2,
      holePar: 4,
      holeYardageM: 320,
      targets,
      playerBag: bag,
      riskPreference: 'aggressive',
      playsLikeDistanceFn: playsLikePlusTen,
      elevationDiffM: 0,
      wind: { speedMps: 0, angleDeg: 0 },
    });

    expect(decision?.strategy).toBe('attack');
    expect(decision?.targetType).toBe('green');
  });

  it('falls back to green when layup target is missing', () => {
    const withoutLayup: HoleCaddieTargets = { ...targets, layup: null };

    const decision = computeCaddieDecision({
      holeNumber: 3,
      holePar: 5,
      holeYardageM: 480,
      targets: withoutLayup,
      playerBag: bag,
      riskPreference: 'safe',
      playsLikeDistanceFn: playsLikePlusTen,
      elevationDiffM: 0,
      wind: { speedMps: 0, angleDeg: 0 },
    });

    expect(decision?.targetType).toBe('green');
  });

  it('applies plays-like distance into targetDistanceM', () => {
    const decision = computeCaddieDecision({
      holeNumber: 4,
      holePar: 3,
      holeYardageM: 150,
      targets,
      playerBag: bag,
      riskPreference: 'balanced',
      playsLikeDistanceFn: (distance) => distance + 10,
      elevationDiffM: 0,
      wind: { speedMps: 0, angleDeg: 0 },
    });

    expect(decision?.targetDistanceM).toBe(160);
  });

  it('maps existing risk profile to balanced', () => {
    expect(normalizeRiskPreference('normal')).toBe('balanced');
  });
});
