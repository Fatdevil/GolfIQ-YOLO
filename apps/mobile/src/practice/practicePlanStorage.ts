import { getItem, setItem } from '@app/storage/asyncStorage';

export const PRACTICE_PLAN_STORAGE_KEY = 'golfiq.practice.plan.v1';

let practicePlanWriteChain: Promise<unknown> = Promise.resolve();

export function serializePracticePlanWrite<T>(op: () => Promise<T>): Promise<T> {
  const next = practicePlanWriteChain.then(op, op);
  practicePlanWriteChain = next.then(() => undefined, () => undefined);
  return next;
}

export type PracticePlanItem = {
  id: string;
  drillId: string;
  createdAt: string;
  source?: {
    type: 'weekly_focus_hint';
    hintId?: string;
  };
  status: 'planned' | 'done';
};

export type PracticePlan = {
  weekStartISO: string;
  items: PracticePlanItem[];
};

function isPracticePlanItem(value: any): value is PracticePlanItem {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.drillId === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.status === 'planned' || value.status === 'done')
  );
}

function isPracticePlan(value: any): value is PracticePlan {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.weekStartISO === 'string' &&
    Array.isArray(value.items) &&
    value.items.every(isPracticePlanItem)
  );
}

export function getWeekStart(date = new Date()): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + diff);
  return result;
}

export function getWeekStartISO(date = new Date()): string {
  return getWeekStart(date).toISOString();
}

export async function loadPracticePlan(): Promise<PracticePlan | null> {
  const raw = await getItem(PRACTICE_PLAN_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (isPracticePlan(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('[practice-plan] Failed to parse plan', err);
  }
  return null;
}

export async function loadCurrentWeekPracticePlan(date = new Date()): Promise<PracticePlan | null> {
  const plan = await loadPracticePlan();
  const weekStartISO = getWeekStartISO(date);
  if (plan?.weekStartISO === weekStartISO) {
    return plan;
  }
  return null;
}

export async function savePracticePlan(plan: PracticePlan): Promise<void> {
  try {
    await setItem(PRACTICE_PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch (err) {
    console.warn('[practice-plan] Failed to save plan', err);
  }
}
