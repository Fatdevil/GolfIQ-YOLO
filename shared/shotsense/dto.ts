import type { IMUFrame } from './types';

export type IMUBatchV1 = {
  v: 1;
  hz: number;
  t0: number;
  frames: number[];
};

export type PackFrame = {
  ts: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

const FRAME_STRIDE = 7;

function toFloat32Array(values: number[]): Float32Array {
  const floats = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    floats[i] = values[i];
  }
  return floats;
}

function fromFloat32Array(buffer: readonly number[]): Float32Array {
  const floats = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    floats[i] = Number(buffer[i]);
  }
  return floats;
}

export function packIMUBatch(hz: number, frames: PackFrame[]): IMUBatchV1 {
  if (!frames.length) {
    return { v: 1, hz, t0: 0, frames: [] };
  }

  const sorted = frames.slice().sort((a, b) => a.ts - b.ts);
  const floats = new Array<number>(sorted.length * FRAME_STRIDE);

  let prevTs = sorted[0]?.ts ?? 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const frame = sorted[i];
    const base = i * FRAME_STRIDE;
    const dt = i === 0 ? 0 : Math.max(0, frame.ts - prevTs);
    prevTs = frame.ts;

    floats[base + 0] = frame.ax;
    floats[base + 1] = frame.ay;
    floats[base + 2] = frame.az;
    floats[base + 3] = frame.gx;
    floats[base + 4] = frame.gy;
    floats[base + 5] = frame.gz;
    floats[base + 6] = dt;
  }

  const float32 = toFloat32Array(floats);
  return {
    v: 1,
    hz,
    t0: sorted[0]?.ts ?? 0,
    frames: Array.from(float32),
  };
}

export function unpackIMUBatch(batch: IMUBatchV1): IMUFrame[] {
  if (!batch.frames.length) {
    return [];
  }

  const floats = fromFloat32Array(batch.frames);
  const frameCount = Math.floor(floats.length / FRAME_STRIDE);
  const frames: IMUFrame[] = new Array(frameCount);

  let ts = batch.t0;

  for (let i = 0; i < frameCount; i += 1) {
    const base = i * FRAME_STRIDE;
    if (i === 0) {
      ts = batch.t0;
    } else {
      ts += floats[base + 6];
    }

    frames[i] = {
      ts,
      ax: floats[base + 0],
      ay: floats[base + 1],
      az: floats[base + 2],
      gx: floats[base + 3],
      gy: floats[base + 4],
      gz: floats[base + 5],
    };
  }

  return frames;
}
