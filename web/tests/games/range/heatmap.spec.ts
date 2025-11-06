import assert from 'node:assert/strict';
import test from 'node:test';

import { makeHeatmap } from '../../../../shared/games/range/heatmap';

const sortBins = (bins: { x: number; y: number; n: number }[]) =>
  [...bins].sort((a, b) => (a.x - b.x) || (a.y - b.y));

test('makeHeatmap returns empty structure when no points', () => {
  const hm = makeHeatmap([]);
  assert.equal(hm.width, 0);
  assert.equal(hm.height, 0);
  assert.deepEqual(hm.bins, []);
});

test('makeHeatmap bins points into grid cells', () => {
  const points = [
    { x: 2, y: -2 },
    { x: 7, y: 3 },
    { x: 7, y: 3 },
    { x: 12, y: 6 },
  ];
  const hm = makeHeatmap(points, 5);
  assert.equal(hm.width, 3);
  assert.equal(hm.height, 2);
  assert.deepEqual(
    sortBins(hm.bins),
    [
      { x: 0, y: 0, n: 1 },
      { x: 1, y: 1, n: 2 },
      { x: 2, y: 1, n: 1 },
    ],
  );
});
