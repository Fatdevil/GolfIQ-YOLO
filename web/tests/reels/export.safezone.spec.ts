import { describe, expect, it } from 'vitest';

import { PRESETS } from '@shared/reels/presets';

import { computeOverlayLayout } from '../../src/features/reels/export/renderTimeline';

describe('computeOverlayLayout', () => {
  it('positions caption within the bottom safe zone', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(preset, { watermark: false, caption: 'Great shot!' });
    expect(layout.caption).not.toBeNull();
    const caption = layout.caption!;
    const safeTop = preset.h - preset.safe.bottom;
    expect(caption.y).toBeGreaterThanOrEqual(safeTop);
    expect(caption.y + caption.height).toBeLessThanOrEqual(preset.h);
  });

  it('positions watermark within the top safe zone', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(preset, { watermark: true, caption: null }, 0.4);
    expect(layout.watermark).not.toBeNull();
    const watermark = layout.watermark!;
    expect(watermark.y).toBeGreaterThanOrEqual(0);
    expect(watermark.y + watermark.height).toBeLessThanOrEqual(preset.safe.top);
    const expectedRightMargin = preset.safe.right ?? 24;
    const expectedWidth = preset.w * 0.12;
    expect(watermark.width).toBeGreaterThan(0);
    expect(Math.abs(watermark.width - expectedWidth)).toBeLessThanOrEqual(8);
    expect(watermark.x + watermark.width).toBeLessThanOrEqual(preset.w - expectedRightMargin + 1);
    expect(watermark.x).toBeGreaterThanOrEqual(0);
  });
});
