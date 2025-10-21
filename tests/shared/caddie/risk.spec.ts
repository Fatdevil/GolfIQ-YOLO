import assert from 'node:assert/strict';
import test from 'node:test';

import { ellipseOverlapRisk, type RiskFeature } from '../../../shared/caddie/risk';

test('ellipseOverlapRisk is higher near hazard overlap', () => {
  const hazard: RiskFeature = {
    kind: 'polygon',
    penalty: 1,
    rings: [
      [
        { x: -5, y: 40 },
        { x: 15, y: 40 },
        { x: 15, y: 60 },
        { x: -5, y: 60 },
        { x: -5, y: 40 },
      ],
    ],
  };

  const safeRisk = ellipseOverlapRisk({
    center: { x: -40, y: 20 },
    longRadius_m: 12,
    latRadius_m: 6,
    features: [hazard],
  });
  const risky = ellipseOverlapRisk({
    center: { x: 4, y: 48 },
    longRadius_m: 15,
    latRadius_m: 9,
    features: [hazard],
  });

  assert.ok(safeRisk < 0.05, `expected safe risk to be small, got ${safeRisk}`);
  assert.ok(risky > safeRisk, 'risk should increase near hazard');
  assert.ok(risky > 0.25, `expected riskier landing to exceed threshold, got ${risky}`);
});
