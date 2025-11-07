import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShotTracerDraw } from '../../../shared/tracer/draw';

test('renders apex label for measured tracer path', () => {
  const shot = {
    id: 'shot-1',
    carry_m: 160,
    apex_m: 32,
    tracer: { points: [[0, 0], [0.4, 0.6], [1, 0]] },
  };
  const result = buildShotTracerDraw(shot, { width: 1080, height: 1920 });
  assert.ok(result, 'expected draw result');
  const tracer = result!.commands.find((cmd) => cmd.t === 'tracer');
  assert.ok(tracer, 'expected tracer command');
  assert.equal(tracer!.dash, undefined);
  const apexLabel = result!.commands.find((cmd) => cmd.t === 'text' && cmd.text.startsWith('Apex'));
  assert.ok(apexLabel, 'expected apex label');
});

test('adds dashed estimate when carry is missing', () => {
  const shot = {
    id: 'shot-2',
    carry_m: undefined,
    carryEstimated: true,
    apex_m: undefined,
    tracer: undefined,
  };
  const result = buildShotTracerDraw(shot, { width: 1080, height: 1920 });
  assert.ok(result, 'expected draw result');
  const tracer = result!.commands.find((cmd) => cmd.t === 'tracer');
  assert.ok(tracer, 'expected tracer command');
  assert.ok(Array.isArray(tracer!.dash), 'expected dash pattern for estimate');
  const estLabel = result!.commands.find((cmd) => cmd.t === 'text' && cmd.text === 'est.');
  assert.ok(estLabel, 'expected est. label');
});
