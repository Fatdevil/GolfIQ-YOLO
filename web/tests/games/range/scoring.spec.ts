import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTargets } from '../../../../shared/games/range/targets';
import { createGame, recordShot } from '../../../../shared/games/range/scoring';

const now = 1_700_000_000_000;

const makeShot = (overrides: Partial<Parameters<typeof recordShot>[1]>) => ({
  ts: now,
  ...overrides,
});

test('recordShot applies streak multipliers and tracks hits', () => {
  const targets = buildTargets([100]);
  let gs = createGame(targets, now);
  const center = targets[0].center;

  gs = recordShot(gs, makeShot({ club: '7i', landing: center }));
  assert.equal(gs.score, 100);
  assert.equal(gs.streak, 1);
  assert.equal(gs.hits.length, 1);

  gs = recordShot(gs, makeShot({ ts: now + 1, club: '7i', landing: center }));
  assert.equal(gs.score, 220);
  assert.equal(gs.streak, 2);

  gs = recordShot(gs, makeShot({ ts: now + 2, club: '7i', landing: center }));
  assert.equal(gs.score, 370);
  assert.equal(gs.streak, 3);

  gs = recordShot(gs, makeShot({ ts: now + 3, club: '7i', landing: center }));
  assert.equal(gs.score, 570);
  assert.equal(gs.streak, 4);
});

test('recordShot aggregates per-club stats and resets streak on miss', () => {
  const targets = buildTargets([100]);
  let gs = createGame(targets, now);

  gs = recordShot(gs, makeShot({ club: 'PW', landing: targets[0].center }));
  assert.deepEqual(gs.perClub['PW'], { shots: 1, hits: 1, score: 100 });

  gs = recordShot(gs, makeShot({ ts: now + 5, club: 'PW', landing: { x: 10, y: 10 } }));
  assert.equal(gs.streak, 0);
  assert.deepEqual(gs.perClub['PW'], { shots: 2, hits: 1, score: 100 });

  gs = recordShot(gs, makeShot({ ts: now + 6, landing: targets[0].center }));
  assert.deepEqual(gs.perClub['Any'], { shots: 1, hits: 1, score: 100 });
});
