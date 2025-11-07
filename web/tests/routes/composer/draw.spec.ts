import { describe, expect, it, vi } from 'vitest';

import type { DrawCmd, ReelTimeline } from '@shared/reels/types';
import { drawCommands } from '../../../src/routes/composer/draw';

const timeline: ReelTimeline = {
  width: 1080,
  height: 1920,
  frames: 60,
  fps: 30,
  shots: [],
};

function createMockCtx() {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

describe('composer drawCommands', () => {
  it('honors dashed tracer commands', () => {
    const ctx = createMockCtx();
    const commands: DrawCmd[] = [
      { t: 'bg', color: '#000' },
      {
        t: 'tracer',
        color: '#fff',
        width: 6,
        pts: [
          [0, 0],
          [10, 10],
        ],
        dash: [4, 8],
      },
    ];
    drawCommands(ctx, timeline, commands);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 8]);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });
});
