import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetRoundStoreForTests,
  __setRoundIdFactoryForTests,
  __setRoundStorageForTests,
  createRound,
  getTracerCalibration,
  loadRound,
  parseRoundPayload,
  saveRound,
  setTracerCalibration,
} from '@shared/round/round_store';
import type { TracerCalibration } from '@shared/tracer/types';

const createMemoryStorage = () => {
  const records = new Map<string, string>();
  const storage = {
    async getItem(key: string): Promise<string | null> {
      return records.has(key) ? records.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      records.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      records.delete(key);
    },
  };
  return { records, storage } as const;
};

describe('shared/round/round_store tracer calibration', () => {
  const memory = createMemoryStorage();

  beforeEach(() => {
    memory.records.clear();
    __resetRoundStoreForTests();
    __setRoundStorageForTests(memory.storage);
    __setRoundIdFactoryForTests(() => 'round-test');
  });

  afterEach(() => {
    __resetRoundStoreForTests();
    __setRoundStorageForTests(null);
    __setRoundIdFactoryForTests(null);
  });

  it('persists calibration across reload', async () => {
    createRound('qa-course');
    const snapshot: TracerCalibration = {
      H: [1, 0, 0, 0, 1.5, 0, 0, 0, 1],
      yardage_m: 152.4,
      quality: 1.25,
      createdAt: 1_700_000_000_000,
    };
    setTracerCalibration(snapshot);
    await saveRound();

    __resetRoundStoreForTests();
    __setRoundStorageForTests(memory.storage);
    __setRoundIdFactoryForTests(() => 'round-test');

    await loadRound();
    const restored = getTracerCalibration();
    expect(restored).not.toBeNull();
    expect(restored?.H).toEqual(snapshot.H);
    expect(restored?.yardage_m).toBeCloseTo(snapshot.yardage_m!);
    expect(restored?.quality).toBe(1);
    expect(restored?.createdAt).toBe(snapshot.createdAt);
  });

  it('sanitizes invalid inputs', () => {
    const invalid = parseRoundPayload({
      id: 'bad-round',
      courseId: 'qa-course',
      startedAt: Date.now(),
      currentHole: 0,
      holes: [],
      tracerCalib: {
        H: [1, 0, 0, 0, 1, 0, 0, 0, Number.NaN],
        yardage_m: 'not-a-number',
        quality: Number.NaN,
        createdAt: '???',
      },
    });
    expect(invalid).not.toBeNull();
    expect(invalid?.tracerCalib).toBeNull();
  });

  it('enforces immutability of returned calibration', () => {
    createRound('qa-course');
    const snapshot: TracerCalibration = {
      H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      yardage_m: 180,
      quality: 0.75,
      createdAt: 123,
    };
    setTracerCalibration(snapshot);
    const first = getTracerCalibration();
    expect(first).not.toBeNull();
    if (first) {
      first.H[0] = 99;
      first.quality = 0.1;
    }
    const second = getTracerCalibration();
    expect(second).not.toBeNull();
    expect(second?.H[0]).toBe(1);
    expect(second?.quality).toBe(0.75);
  });

  it('defaults to null calibration for new rounds', () => {
    createRound('qa-course');
    expect(getTracerCalibration()).toBeNull();

    const sanitized = parseRoundPayload({
      id: 'plain-round',
      courseId: 'qa-course',
      startedAt: Date.now(),
      currentHole: 0,
      holes: [],
    });
    expect(sanitized).not.toBeNull();
    expect(sanitized?.tracerCalib).toBeNull();
  });
});
