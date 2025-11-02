import { describe, expect, it } from 'vitest';
import { ShotDetector } from '../detector';
import type { GpsContext, IMUFrame, ShotSenseEvent } from '../types';
import { ShotSenseService } from '../../../golfiq/app/src/shotsense/ShotSenseService';

const SAMPLE_HZ = 100;
const DT = Math.round(1000 / SAMPLE_HZ);
const UINT32_MAX = 0xffffffff;

const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / UINT32_MAX;
  };
};

const jitter = (rng: () => number, amplitude: number) => (rng() - 0.5) * 2 * amplitude;

const createNoiseFrames = (startTs: number, count: number, rng: () => number): IMUFrame[] => {
  const frames: IMUFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const ts = startTs + i * DT;
    frames.push({
      ts,
      ax: jitter(rng, 0.5),
      ay: jitter(rng, 0.5),
      az: 9.81 + jitter(rng, 0.4),
      gx: jitter(rng, 8),
      gy: jitter(rng, 8),
      gz: jitter(rng, 8),
    });
  }
  return frames;
};

const createSwingBurst = (
  startTs: number,
  durationMs: number,
  gyroPeak: number,
  accelPeak: number,
  rng: () => number,
): IMUFrame[] => {
  const frames: IMUFrame[] = [];
  const steps = Math.max(1, Math.round(durationMs / DT));
  for (let i = 0; i < steps; i += 1) {
    const ts = startTs + i * DT;
    const phase = steps === 1 ? 0.5 : i / (steps - 1);
    const envelope = Math.sin(Math.PI * phase);
    frames.push({
      ts,
      ax: envelope * accelPeak * 0.2 + jitter(rng, 0.3),
      ay: envelope * accelPeak * 0.8 + jitter(rng, 0.3),
      az: 9.81 + envelope * accelPeak * 0.4 + jitter(rng, 0.3),
      gx: envelope * gyroPeak + jitter(rng, 6),
      gy: envelope * gyroPeak * 0.5 + jitter(rng, 6),
      gz: envelope * gyroPeak * 0.3 + jitter(rng, 6),
    });
  }
  return frames;
};

const feedFrames = (detector: ShotDetector, frames: IMUFrame[]): ShotSenseEvent[] => {
  const events: ShotSenseEvent[] = [];
  for (const frame of frames) {
    events.push(...detector.pushIMU(frame));
  }
  return events;
};

const pushGpsSeries = (detector: ShotDetector, contexts: GpsContext[]): void => {
  for (const ctx of contexts) {
    detector.pushGPS(ctx);
  }
};

describe('ShotDetector', () => {
  it('detects a deterministic swing burst', () => {
    const detector = new ShotDetector({ sampleHz: SAMPLE_HZ });
    const rng = makeRng(123);
    const allEvents: ShotSenseEvent[] = [];

    let ts = 0;
    detector.pushGPS({ ts, speed_mps: 0.1, distToGreen_m: 150, onGreen: false });

    allEvents.push(...feedFrames(detector, createNoiseFrames(ts, 40, rng)));
    ts += 40 * DT;

    const swing = createSwingBurst(ts, 900, 600, 28, rng);
    allEvents.push(...feedFrames(detector, swing));
    ts = swing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: ts + 100, speed_mps: 0.3, distToGreen_m: 148, onGreen: false },
      { ts: ts + 300, speed_mps: 1.6, distToGreen_m: 144, onGreen: false },
    ]);

    allEvents.push(...feedFrames(detector, createNoiseFrames(ts, 80, rng)));

    expect(allEvents).toHaveLength(1);
    const event = allEvents[0];
    expect(event.kind).toBe('ShotDetected');
    expect(event.at.features.gyroPeak).toBeGreaterThan(500);
    expect(event.at.features.accelPeak).toBeGreaterThan(20);
    expect(event.at.strength).toBeGreaterThan(0.8);
  });

  it('ignores walking noise and jitter', () => {
    const detector = new ShotDetector({ sampleHz: SAMPLE_HZ });
    const rng = makeRng(456);
    detector.pushGPS({ ts: 0, speed_mps: 1, distToGreen_m: 120, onGreen: false });

    let ts = 0;
    const events: ShotSenseEvent[] = [];
    for (let i = 0; i < 400; i += 1) {
      const frame = createNoiseFrames(ts, 1, rng)[0];
      events.push(...detector.pushIMU(frame));
      ts += DT;
    }

    expect(events).toHaveLength(0);
  });

  it('debounces bursts closer than the configured window', () => {
    const detector = new ShotDetector({ sampleHz: SAMPLE_HZ, debounce_ms: 2500 });
    const rng = makeRng(789);
    const events: ShotSenseEvent[] = [];
    let ts = 0;

    detector.pushGPS({ ts, speed_mps: 0.2, distToGreen_m: 160, onGreen: false });

    const warmup = createNoiseFrames(ts, 20, rng);
    events.push(...feedFrames(detector, warmup));
    ts = warmup.at(-1)?.ts ?? ts;
    ts += DT;

    const firstSwing = createSwingBurst(ts, 820, 630, 27, rng);
    events.push(...feedFrames(detector, firstSwing));
    const firstPeak = firstSwing[Math.floor(firstSwing.length * 0.6)]?.ts ?? ts;
    ts = firstSwing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: firstPeak + 140, speed_mps: 0.5, distToGreen_m: 158, onGreen: false },
      { ts: firstPeak + 320, speed_mps: 1.5, distToGreen_m: 154, onGreen: false },
    ]);

    const settle = createNoiseFrames(ts, 60, rng);
    events.push(...feedFrames(detector, settle));
    ts = settle.at(-1)?.ts ?? ts;
    ts += DT;

    const gap = createNoiseFrames(ts, 80, rng);
    events.push(...feedFrames(detector, gap));
    ts = gap.at(-1)?.ts ?? ts;
    ts += DT;

    const secondSwing = createSwingBurst(ts, 820, 640, 28, rng);
    events.push(...feedFrames(detector, secondSwing));
    const secondPeak = secondSwing[Math.floor(secondSwing.length * 0.6)]?.ts ?? ts;
    ts = secondSwing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: secondPeak + 150, speed_mps: 0.6, distToGreen_m: 150, onGreen: false },
      { ts: secondPeak + 340, speed_mps: 1.6, distToGreen_m: 146, onGreen: false },
    ]);

    const tail = createNoiseFrames(ts, 60, rng);
    events.push(...feedFrames(detector, tail));

    expect(events).toHaveLength(1);
  });

  it('suppresses swings while on the green', () => {
    const detector = new ShotDetector({ sampleHz: SAMPLE_HZ });
    const rng = makeRng(321);
    let ts = 0;

    detector.pushGPS({ ts, speed_mps: 0.05, distToGreen_m: 5, onGreen: true });

    const swing = createSwingBurst(ts, 900, 600, 28, rng);
    const events = feedFrames(detector, swing);
    ts = swing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: ts + 150, speed_mps: 0.3, distToGreen_m: 4, onGreen: true },
      { ts: ts + 350, speed_mps: 0.6, distToGreen_m: 3.5, onGreen: true },
    ]);

    events.push(...feedFrames(detector, createNoiseFrames(ts, 80, rng)));

    expect(events).toHaveLength(0);
  });

  it('requires post-impact movement within the configured window', () => {
    const detector = new ShotDetector({ sampleHz: SAMPLE_HZ });
    const rng = makeRng(654);
    let ts = 0;
    detector.pushGPS({ ts, speed_mps: 0.1, distToGreen_m: 130, onGreen: false });

    const firstSwing = createSwingBurst(ts, 900, 610, 29, rng);
    const events = feedFrames(detector, firstSwing);
    const firstPeak = firstSwing[Math.floor(firstSwing.length * 0.6)]?.ts ?? ts;
    ts = firstSwing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: firstPeak + 120, speed_mps: 0.25, distToGreen_m: 129.5, onGreen: false },
      { ts: firstPeak + 320, speed_mps: 0.3, distToGreen_m: 129.2, onGreen: false },
    ]);

    const idle = createNoiseFrames(ts, 200, rng);
    events.push(...feedFrames(detector, idle));
    ts = idle.at(-1)?.ts ?? ts;
    ts += DT;

    const secondSwing = createSwingBurst(ts, 900, 620, 30, rng);
    events.push(...feedFrames(detector, secondSwing));
    const secondPeak = secondSwing[Math.floor(secondSwing.length * 0.6)]?.ts ?? ts;
    ts = secondSwing.at(-1)?.ts ?? ts;
    ts += DT;

    pushGpsSeries(detector, [
      { ts: secondPeak + 140, speed_mps: 0.6, distToGreen_m: 128, onGreen: false },
      { ts: secondPeak + 360, speed_mps: 1.3, distToGreen_m: 125, onGreen: false },
    ]);

    const tail = createNoiseFrames(ts, 120, rng);
    events.push(...feedFrames(detector, tail));

    const detected = events.filter((evt) => evt.kind === 'ShotDetected');
    expect(detected).toHaveLength(1);
    expect(detected[0]?.at.strength).toBeGreaterThan(0.75);
  });

  it('adapts sample windows when sampleHz changes', () => {
    const detector = new ShotDetector({ sampleHz: 100, minSwingWindow_ms: 300 });
    const before = (detector as any).minSwingWinSamples;
    detector.setSampleHz(50);
    const after = (detector as any).minSwingWinSamples;
    expect(after).toBeLessThan(before);
  });

  it('ShotSenseService reconfigures on incoming hz', () => {
    const originalDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
    try {
      const service = new ShotSenseService();
      (service as any).ensureHz(50);
      expect((service as any).currentHz).toBe(50);
      (service as any).ensureHz(100);
      expect((service as any).currentHz).toBe(100);
    } finally {
      if (originalDev === undefined) {
        delete (globalThis as any).__DEV__;
      } else {
        (globalThis as any).__DEV__ = originalDev;
      }
    }
  });
});
