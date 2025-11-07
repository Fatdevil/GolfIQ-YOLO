import type { Homography } from '../tracer/calibrate';
import type { TracerTooltip } from '../tracer/types';

export type ReelShotRef = {
  ts: number;
  id: string;
  club?: string;
  carry_m?: number;
  carryEstimated?: boolean;
  total_m?: number;
  apex_m?: number;
  ballSpeed_mps?: number;
  startDeg?: number;
  lateralSign?: number;
  playsLikePct?: number;
  tracer?: { points: [number, number][] };
  telemetryFlags?: string[];
};

export type ReelTimeline = {
  width: number;
  height: number;
  frames: number;
  fps: number;
  homography?: Homography | null;
  shots: {
    ref: ReelShotRef;
    startFrame: number;
    duration: number;
  }[];
};

export type DrawCmd =
  | { t: 'bg'; color: string }
  | {
      t: 'tracer';
      pts: [number, number][];
      color: string;
      width: number;
      dash?: number[];
      tooltip?: TracerTooltip;
    }
  | { t: 'dot'; x: number; y: number; r: number; color: string }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
    }
  | { t: 'compass'; cx: number; cy: number; deg: number; radius: number; color: string }
  | { t: 'bar'; x: number; y: number; w: number; h: number; color: string };
