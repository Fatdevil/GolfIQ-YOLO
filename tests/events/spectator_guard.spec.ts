import { describe, expect, it, vi } from 'vitest';

import { createBackoffController } from '@shared/events/resync';
import { buildSpectatorBoard, sanitizeSpectatorRow, type SpectatorPlayer } from '@shared/events/spectator';

const typeSamples = (() => {
  const valid: SpectatorPlayer = {
    name: 'Valid',
    gross: 72,
    thru: 9,
    hole: 10,
  };
  // @ts-expect-error spectator payload is restricted to safe fields
  const invalid: SpectatorPlayer = { ...valid, coach: 'nope' };
  void invalid;
  return valid;
})();
void typeSamples;

describe('spectator board guard', () => {
  it('sanitizes individual rows', () => {
    const row = sanitizeSpectatorRow({
      name: 'Alice',
      gross: 70,
      net: 68,
      thru: 9,
      hole: 10,
      status: 'playing',
      coach: 'hidden' as unknown,
    });
    expect(row).toEqual({ name: 'Alice', gross: 70, net: 68, thru: 9, hole: 10, status: 'playing' });
    expect((row as Record<string, unknown>).coach).toBeUndefined();
  });

  it('drops extra fields when building the board', () => {
    const board = buildSpectatorBoard([
      {
        name: 'Ben',
        gross: 74,
        net: 71,
        thru: 12,
        hole: 13,
        status: 'playing',
        coach: 'secret' as unknown,
      },
    ]);
    expect(board.players).toHaveLength(1);
    expect(Object.keys(board.players[0]!)).toEqual(['name', 'gross', 'net', 'thru', 'hole', 'status']);
  });
});

describe('resync backoff controller', () => {
  it('resets attempts on success and caps failure delay', () => {
    const controller = createBackoffController({
      baseMs: 100,
      maxMs: 800,
      successMs: 1200,
      successMaxMs: 2000,
      jitter: 0,
    });

    expect(controller.failure()).toBe(100);
    expect(controller.failure()).toBe(200);
    expect(controller.failure()).toBe(400);
    expect(controller.failure()).toBe(800);
    expect(controller.failure()).toBe(800);
    expect(controller.attempts()).toBe(5);

    expect(controller.success()).toBe(1200);
    expect(controller.attempts()).toBe(0);
    expect(controller.failure()).toBe(100);
  });

  it('honors the success max cap when jitter pushes above the limit', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    const controller = createBackoffController({
      baseMs: 100,
      maxMs: 800,
      successMs: 1200,
      successMaxMs: 1500,
      jitter: 0.5,
    });

    const delay = controller.success();
    expect(delay).toBeLessThanOrEqual(1500);
    expect(delay).toBeGreaterThanOrEqual(1200);
    random.mockRestore();
  });
});
