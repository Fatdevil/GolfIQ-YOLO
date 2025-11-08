import { describe, expect, it } from 'vitest';

import { PRESETS } from '@shared/reels/presets';

import { computeOverlayLayout } from '../../src/features/reels/export/renderTimeline';

describe('computeOverlayLayout', () => {
  it('positions caption within the bottom safe zone', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(preset, {
      watermark: false,
      caption: 'Great shot!',
      includeBadges: false,
    });
    expect(layout.caption).not.toBeNull();
    const caption = layout.caption!;
    const safeTop = preset.h - preset.safe.bottom;
    expect(caption.y).toBeGreaterThanOrEqual(safeTop);
    expect(caption.y + caption.height).toBeLessThanOrEqual(preset.h);
  });

  it('positions watermark within the top safe zone', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(
      preset,
      { watermark: true, caption: null, includeBadges: false },
      0.4,
    );
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
  it('keeps badge layout within the top safe zone when enabled', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(
      preset,
      { watermark: true, caption: null, includeBadges: true },
      0.5,
    );
    expect(layout.badges).not.toBeNull();
    const badges = layout.badges!;
    expect(badges.carry.y).toBeGreaterThanOrEqual(0);
    expect(badges.carry.y + badges.carry.height).toBeLessThanOrEqual(layout.watermark?.y ?? preset.safe.top);
    expect(badges.club.y).toBeGreaterThanOrEqual(badges.carry.y);
    expect(badges.club.y + badges.club.height).toBeLessThanOrEqual(layout.watermark?.y ?? preset.safe.top);
    expect(badges.carry.x).toBeGreaterThanOrEqual(0);
    expect(badges.carry.x + badges.carry.width).toBeLessThanOrEqual(preset.w);
  });

  it('omits badges when includeBadges is disabled', () => {
    const preset = PRESETS.reels_1080x1920_30;
    const layout = computeOverlayLayout(preset, {
      watermark: true,
      caption: null,
      includeBadges: false,
    });
    expect(layout.badges).toBeNull();
  });
});
