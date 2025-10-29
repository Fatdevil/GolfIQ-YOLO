import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultProfile, type PlayerProfile } from '../../../shared/coach/profile';
import { pickAdviceStyle, pickRisk, rankFocus } from '../../../shared/coach/policy';

test('rankFocus prioritises deficits and low adherence', () => {
  const profile: PlayerProfile = {
    ...createDefaultProfile('tester'),
    focusWeights: {
      'long-drive': 0.1,
      tee: 0.1,
      approach: 0.15,
      wedge: 0.1,
      short: 0.1,
      putt: 0.25,
      recovery: 0.2,
    },
    sgLiftByFocus: {
      putt: -0.5,
      wedge: 0.1,
    },
    adherenceScore: 0.4,
  };
  const ranked = rankFocus(profile);
  assert.equal(ranked[0].focus, 'putt');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('pickAdviceStyle mirrors profile style preferences', () => {
  const profile = createDefaultProfile('tester');
  profile.style = { tone: 'pep', verbosity: 'detailed' };
  const style = pickAdviceStyle(profile);
  assert.equal(style.tone, 'pep');
  assert.equal(style.verbosity, 'detailed');
});

test('pickRisk considers adoption, lift and hazards', () => {
  const profile = createDefaultProfile('tester');
  profile.adoptRate = 0.2;
  let risk = pickRisk(profile, { hazardDensity: 0.8 });
  assert.equal(risk, 'safe');
  profile.adoptRate = 0.8;
  profile.adherenceScore = 0.8;
  profile.sgLiftByFocus = { approach: 0.2 };
  risk = pickRisk(profile, { hazardDensity: 0.2 });
  assert.equal(risk, 'aggressive');
});
