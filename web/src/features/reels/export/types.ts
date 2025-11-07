import type { DrawCmd, ReelShotRef } from '@shared/reels/types';
import type { TracerDrawResult } from '@shared/tracer/draw';

export type ReelThemeId = 'classic' | 'neon' | 'pro-dark';

export type ReelTheme = {
  id: ReelThemeId;
  background: string;
  tracer: string;
  primaryText: string;
  secondaryText: string;
  badgeBackground: string;
  badgeStroke: string;
  badgeText: string;
  watermark: string;
};

export type TimelineLayoutBadge = { x: number; y: number; width: number; height: number };

export type TimelineLayout = {
  badges?: {
    carry: TimelineLayoutBadge;
    club: TimelineLayoutBadge;
  };
  watermark?: TimelineLayoutBadge & { text: string };
};

export type DrawTimelineFrame = {
  commands: DrawCmd[];
};

export type DrawTimeline = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  frameCount: number;
  frames: DrawTimelineFrame[];
  tracerStyle: 'solid' | 'dashed';
  theme: ReelThemeId;
  layout: TimelineLayout;
};

export type DrawTimelineBuilder = (context: {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  includeBadges: boolean;
  includeWatermark: boolean;
  watermarkText: string | null;
}) => DrawTimeline;

export type BuildTimelineInput = {
  shot: ReelShotRef;
  fit: TracerDrawResult;
  theme: ReelTheme;
};

export type ReelTemplate = {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  theme: ReelThemeId;
};

export type RenderTracerReelOptions = {
  videoSrc?: string | ArrayBuffer | Uint8Array | Blob | null;
  fps?: number;
  width?: number;
  height?: number;
  startMs: number;
  endMs: number;
  drawTimeline: DrawTimeline | DrawTimelineBuilder;
  includeBadges?: boolean;
  watermark?: boolean;
  watermarkText?: string;
  theme?: ReelThemeId;
  watermarkDate?: Date;
  musicSrc?: string | null;
  templateId?: string;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal | null;
};

export type RenderTracerReelResult = {
  blob: Blob;
  codec: 'mp4' | 'webm';
  durationMs: number;
  frameCount: number;
  width: number;
  height: number;
  timeline: DrawTimeline;
};

export type RenderFailure = {
  error: Error;
  stage: 'init' | 'encode' | 'finalize';
};

export type ReelExportPreset = ReelTemplate & {
  description: string;
};

export type ReelTimelineMetadata = {
  templateId: string;
  codec: 'mp4' | 'webm';
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  includeBadges: boolean;
  includeWatermark: boolean;
  watermarkText: string | null;
  theme: ReelThemeId;
};
