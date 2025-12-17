import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./practicePlanStorage', () => {
  type PracticePlanItem = {
    id: string;
    drillId: string;
    createdAt: string;
    status: 'planned' | 'done';
  };

  type PracticePlan = {
    weekStartISO: string;
    items: PracticePlanItem[];
  };

  let stored: PracticePlan | null = { weekStartISO: 'week', items: [] };
  let writeChain: Promise<unknown> = Promise.resolve();

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const serializePracticePlanWrite = <T,>(op: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(op, op);
    writeChain = next.then(() => undefined, () => undefined);
    return next;
  };

  return {
    PRACTICE_PLAN_STORAGE_KEY: 'test-key',
    getWeekStartISO: () => 'week',
    getWeekStart: () => new Date(0),
    loadPracticePlan: async () => {
      await delay(5);
      return stored;
    },
    savePracticePlan: async (plan: PracticePlan) => {
      await delay(5);
      stored = plan;
    },
    serializePracticePlanWrite,
    __getStoredPlan: () => stored,
    __resetPlan: () => {
      stored = { weekStartISO: 'week', items: [] };
      writeChain = Promise.resolve();
    },
  };
});

import { addDrillToPlan, focusHintToDrills } from './focusHintToDrills';

describe('focusHintToDrills', () => {
  it('returns putting drills for 3-putt hints', () => {
    const drills = focusHintToDrills({ id: 'hint-1', text: 'Limit 3-putts and work on lag putting' });
    expect(drills[0]?.category).toBe('putting');
  });

  it('returns driving drills for fairway accuracy hints', () => {
    const drills = focusHintToDrills({ id: 'hint-2', text: 'Find more fairways with a reliable tee shot' });
    expect(drills[0]?.category).toBe('driving');
  });
});

describe('addDrillToPlan serialization', () => {
  beforeEach(async () => {
    const storage = (await import('./practicePlanStorage')) as any;
    storage.__resetPlan();
  });

  it('keeps both drills when adding concurrently', async () => {
    await Promise.all([addDrillToPlan('drill-a'), addDrillToPlan('drill-b')]);

    const storage = (await import('./practicePlanStorage')) as any;
    const plan = storage.__getStoredPlan();

    expect(plan?.items).toHaveLength(2);
    expect(plan?.items.map((item: any) => item.drillId).sort()).toEqual(['drill-a', 'drill-b']);
  });

  it('dedupes duplicate drill during concurrent add', async () => {
    await Promise.all([addDrillToPlan('drill-a'), addDrillToPlan('drill-a')]);

    const storage = (await import('./practicePlanStorage')) as any;
    const plan = storage.__getStoredPlan();

    expect(plan?.items).toHaveLength(1);
    expect(plan?.items[0]?.drillId).toBe('drill-a');
  });
});
