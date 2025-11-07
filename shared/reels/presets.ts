import type { ReelExportPreset } from './types';

export const PRESET_IDS = [
  'tiktok_1080x1920_60',
  'reels_1080x1920_30',
  'shorts_1080x1920_60',
  'square_1080x1080_30',
] as const;

export type ReelExportPresetId = (typeof PRESET_IDS)[number];

export const PRESETS: Record<ReelExportPresetId, ReelExportPreset> = {
  tiktok_1080x1920_60: {
    id: 'tiktok_1080x1920_60',
    w: 1080,
    h: 1920,
    fps: 60,
    bitrate: 18_000_000,
    safe: { top: 160, bottom: 280 },
    description: '60 fps vertical optimized for TikTok uploads with generous bottom safe zone.',
  },
  reels_1080x1920_30: {
    id: 'reels_1080x1920_30',
    w: 1080,
    h: 1920,
    fps: 30,
    bitrate: 12_000_000,
    safe: { top: 140, bottom: 240 },
    description: 'Balanced 30 fps preset tuned for Instagram Reels sharing.',
  },
  shorts_1080x1920_60: {
    id: 'shorts_1080x1920_60',
    w: 1080,
    h: 1920,
    fps: 60,
    bitrate: 16_000_000,
    safe: { top: 150, bottom: 260 },
    description: 'High frame-rate preset ready for YouTube Shorts distribution.',
  },
  square_1080x1080_30: {
    id: 'square_1080x1080_30',
    w: 1080,
    h: 1080,
    fps: 30,
    bitrate: 10_000_000,
    safe: { top: 120, bottom: 180 },
    description: 'Square format for feed posts and legacy clients.',
  },
};

export function listPresets(): ReelExportPreset[] {
  return PRESET_IDS.map((id) => PRESETS[id]);
}

export function getPresetById(id: string | null | undefined): ReelExportPreset | null {
  if (!id) {
    return null;
  }
  return PRESETS[id as ReelExportPresetId] ?? null;
}

export const DEFAULT_REEL_EXPORT_PRESET_ID: ReelExportPresetId = PRESET_IDS[0];
