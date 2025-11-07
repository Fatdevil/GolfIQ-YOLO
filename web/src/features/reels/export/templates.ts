import type { DrawCmd, ReelShotRef } from '@shared/reels/types';
import { PRESET_IDS, PRESETS } from '@shared/reels/presets';
import type { ReelExportPresetId } from '@shared/reels/presets';
import type { TracerDrawResult } from '@shared/tracer/draw';

import {
  type BuildTimelineInput,
  type DrawTimeline,
  type DrawTimelineBuilder,
  type ReelExportPreset,
  type ReelTheme,
  type ReelThemeId,
  type TimelineLayout,
} from './types';

const SAFE_MARGIN = 32;
const DEFAULT_FPS = 30;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function cloneCommands(commands: DrawCmd[]): DrawCmd[] {
  return commands.map((cmd) => ({ ...cmd }));
}

const THEMES: Record<ReelThemeId, ReelTheme> = {
  classic: {
    id: 'classic',
    background: '#050910',
    tracer: '#00e6ff',
    primaryText: '#f8fafc',
    secondaryText: '#cbd5f5',
    badgeBackground: '#111827cc',
    badgeStroke: '#22d3ee',
    badgeText: '#f1f5f9',
    watermark: '#94a3b8',
  },
  neon: {
    id: 'neon',
    background: '#05060f',
    tracer: '#7c3aed',
    primaryText: '#f5f3ff',
    secondaryText: '#d8b4fe',
    badgeBackground: '#1f1147cc',
    badgeStroke: '#f472b6',
    badgeText: '#f5f3ff',
    watermark: '#c084fc',
  },
  'pro-dark': {
    id: 'pro-dark',
    background: '#020617',
    tracer: '#38bdf8',
    primaryText: '#e2e8f0',
    secondaryText: '#94a3b8',
    badgeBackground: '#0f172acc',
    badgeStroke: '#38bdf8',
    badgeText: '#f8fafc',
    watermark: '#64748b',
  },
};

const PRESET_META: Record<ReelExportPresetId, { label: string; theme: ReelThemeId }> = {
  tiktok_1080x1920_60: { label: 'TikTok 1080×1920 · 60fps', theme: 'classic' },
  reels_1080x1920_30: { label: 'Instagram Reels 1080×1920 · 30fps', theme: 'pro-dark' },
  shorts_1080x1920_60: { label: 'YouTube Shorts 1080×1920 · 60fps', theme: 'neon' },
  square_1080x1080_30: { label: 'Square 1080×1080 · 30fps', theme: 'classic' },
};

export const REEL_EXPORT_PRESETS: ReelExportPreset[] = PRESET_IDS.map((id) => {
  const base = PRESETS[id];
  const meta = PRESET_META[id] ?? { label: base.id, theme: 'classic' };
  return {
    ...base,
    label: meta.label,
    theme: meta.theme,
    width: base.w,
    height: base.h,
  } satisfies ReelExportPreset;
});

export function resolveTheme(candidate?: ReelThemeId | ReelTheme | null): ReelTheme {
  if (!candidate) {
    return THEMES.classic;
  }
  if (typeof candidate === 'string') {
    return THEMES[candidate] ?? THEMES.classic;
  }
  return THEMES[candidate.id] ?? candidate;
}

function resolveWatermarkText(
  include: boolean,
  baseText: string | null | undefined,
  stamp: Date,
): string | null {
  if (!include) {
    return null;
  }
  if (baseText) {
    return baseText;
  }
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
  const month = monthNames[clamp(stamp.getMonth(), 0, 11)] ?? 'Jan';
  const day = clamp(stamp.getDate(), 1, 31);
  const year = stamp.getFullYear();
  return `GolfIQ-YOLO · ${month} ${day}, ${year}`;
}

function clampCommandToSafeArea(cmd: DrawCmd, width: number, height: number): DrawCmd {
  if (cmd.t === 'text') {
    return {
      ...cmd,
      x: clamp(cmd.x, SAFE_MARGIN, width - SAFE_MARGIN),
      y: clamp(cmd.y, SAFE_MARGIN, height - SAFE_MARGIN),
    };
  }
  if (cmd.t === 'dot') {
    return {
      ...cmd,
      x: clamp(cmd.x, SAFE_MARGIN, width - SAFE_MARGIN),
      y: clamp(cmd.y, SAFE_MARGIN, height - SAFE_MARGIN),
    };
  }
  return cmd;
}

function formatCarry(shot: ReelShotRef): string {
  const carry = Number.isFinite(shot.carry_m ?? null) ? Math.round(shot.carry_m!) : null;
  const total = Number.isFinite(shot.total_m ?? null) ? Math.round(shot.total_m!) : null;
  const value = carry ?? total ?? 0;
  return `${value} m`;
}

function buildBadgeCommands({
  x,
  y,
  width,
  height,
  text,
  theme,
  align,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  theme: ReelTheme;
  align: 'left' | 'center' | 'right';
}): DrawCmd[] {
  const paddingX = 24;
  const textX = align === 'right' ? x + width - paddingX : align === 'center' ? x + width / 2 : x + paddingX;
  const textAlign: Extract<DrawCmd, { t: 'text' }>['align'] = align;
  return [
    { t: 'bar', x, y, w: width, h: height, color: theme.badgeBackground },
    {
      t: 'text',
      x: textX,
      y: y + height / 2,
      text,
      size: 44,
      color: theme.badgeText,
      align: textAlign,
      bold: true,
    },
  ];
}

function buildTimelineFrames({
  shot,
  fit,
  theme,
}: BuildTimelineInput, context: {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  includeBadges: boolean;
  includeWatermark: boolean;
  watermarkText: string | null;
}): DrawTimeline {
  const width = Math.max(1, Math.round(context.width));
  const height = Math.max(1, Math.round(context.height));
  const fps = Math.max(1, Math.min(30, Math.round(context.fps || DEFAULT_FPS)));
  const durationMs = Math.max(1, Math.round(context.durationMs));
  const frameCount = Math.max(1, Math.ceil((durationMs / 1000) * fps));

  const safeTheme = resolveTheme(theme);
  const baseCommands: DrawCmd[] = [{ t: 'bg', color: safeTheme.background }];
  const tracerCommands = fit.commands.map((cmd) => clampCommandToSafeArea(cmd, width, height));
  baseCommands.push(...tracerCommands);

  const layout: TimelineLayout = {};

  if (context.includeBadges) {
    const badgeWidth = clamp(Math.round(width * 0.4), 240, width - SAFE_MARGIN * 2);
    const badgeHeight = 104;
    const carryBadgeX = width - SAFE_MARGIN - badgeWidth;
    const carryBadgeY = SAFE_MARGIN;
    const clubBadgeY = carryBadgeY + badgeHeight + 16;
    const clubBadgeX = carryBadgeX;

    const carryText = `Carry ${formatCarry(shot)}`;
    const clubText = shot.club ? shot.club.toUpperCase() : '—';

    baseCommands.push(
      ...buildBadgeCommands({
        x: carryBadgeX,
        y: carryBadgeY,
        width: badgeWidth,
        height: badgeHeight,
        text: carryText,
        theme: safeTheme,
        align: 'center',
      }),
      ...buildBadgeCommands({
        x: clubBadgeX,
        y: clubBadgeY,
        width: badgeWidth,
        height: badgeHeight,
        text: clubText,
        theme: safeTheme,
        align: 'center',
      }),
    );

    layout.badges = {
      carry: { x: carryBadgeX, y: carryBadgeY, width: badgeWidth, height: badgeHeight },
      club: { x: clubBadgeX, y: clubBadgeY, width: badgeWidth, height: badgeHeight },
    };
  }

  if (context.includeWatermark && context.watermarkText) {
    const watermark = context.watermarkText;
    const widthEstimate = Math.min(width - SAFE_MARGIN * 2, Math.max(240, watermark.length * 18));
    const watermarkWidth = Math.round(widthEstimate);
    const watermarkHeight = 72;
    const x = SAFE_MARGIN;
    const y = height - SAFE_MARGIN - watermarkHeight;
    baseCommands.push(
      { t: 'bar', x, y, w: watermarkWidth, h: watermarkHeight, color: `${safeTheme.badgeBackground}` },
      {
        t: 'text',
        x: x + watermarkWidth / 2,
        y: y + watermarkHeight / 2,
        text: watermark,
        size: 32,
        color: safeTheme.watermark,
        align: 'center',
        bold: false,
      },
    );
    layout.watermark = { x, y, width: watermarkWidth, height: watermarkHeight, text: watermark };
  }

  const frames = Array.from({ length: frameCount }, () => ({ commands: cloneCommands(baseCommands) }));

  return {
    width,
    height,
    fps,
    durationMs,
    frameCount,
    frames,
    tracerStyle: fit.estimated || fit.source !== 'raw' ? 'dashed' : 'solid',
    theme: safeTheme.id,
    layout,
  } satisfies DrawTimeline;
}

export function buildDrawTimeline(
  shot: ReelShotRef,
  fit: TracerDrawResult,
  theme: ReelThemeId | ReelTheme,
): DrawTimelineBuilder {
  const safeTheme = resolveTheme(theme);
  return (context) => {
    const watermark = resolveWatermarkText(context.includeWatermark, context.watermarkText, new Date());
    return buildTimelineFrames({ shot, fit, theme: safeTheme }, { ...context, watermarkText: watermark });
  };
}

export function formatWatermark(include: boolean, watermarkText: string | undefined, when: Date): string | null {
  return resolveWatermarkText(include, watermarkText, when);
}

export { THEMES as REEL_THEMES };
