import type { WeeklyFocusCategory, WeeklyFocusHint } from '@app/api/weeklySummaryClient';

import { DRILLS_CATALOG, type DrillCategory, type PracticeDrill } from './drillsCatalog';
import { getWeekStartISO, loadPracticePlan, savePracticePlan, type PracticePlan, type PracticePlanItem } from './practicePlanStorage';

const KEYWORD_MAPPINGS: Array<{ keywords: string[]; category: DrillCategory }> = [
  { keywords: ['putt', '3-putt', 'lag', 'green speed', 'greens'], category: 'putting' },
  { keywords: ['fairway', 'tee shot', 'driver', 'off the tee'], category: 'driving' },
  { keywords: ['approach', 'gir', 'green in regulation', 'distance control', 'wedge', 'iron'], category: 'approach' },
  { keywords: ['short game', 'chip', 'pitch', 'bunker', 'up-and-down', 'up and down'], category: 'short_game' },
  { keywords: ['tempo', 'rhythm', 'smooth'], category: 'tempo' },
];

function normalizeCategory(category?: WeeklyFocusCategory | DrillCategory): DrillCategory | undefined {
  if (!category || category === 'overall') return undefined;
  if (category === 'short_game') return 'short_game';
  if (category === 'tempo') return 'tempo';
  if (category === 'driving' || category === 'approach' || category === 'putting') return category;
  return undefined;
}

function inferCategory(hint: WeeklyFocusHint | string, fallbackCategory?: WeeklyFocusCategory | DrillCategory): DrillCategory | undefined {
  const text = typeof hint === 'string' ? hint : hint.text;
  const normalizedFallback = normalizeCategory(fallbackCategory);
  const hintedCategory = normalizeCategory(typeof hint === 'string' ? undefined : hint.category);

  const lower = text.toLowerCase();
  const keywordCategory = KEYWORD_MAPPINGS.find((entry) => entry.keywords.some((keyword) => lower.includes(keyword)))?.category;

  return keywordCategory ?? hintedCategory ?? normalizedFallback;
}

export function focusHintToDrills(
  hint: WeeklyFocusHint | string,
  fallbackCategory?: WeeklyFocusCategory | DrillCategory,
): PracticeDrill[] {
  const category = inferCategory(hint, fallbackCategory);
  let drills = category ? DRILLS_CATALOG.filter((drill) => drill.category === category) : [];
  if (!drills.length && category !== 'putting') {
    drills = DRILLS_CATALOG.filter((drill) => drill.category === 'putting' || drill.category === 'tempo');
  }
  return drills.slice(0, 2);
}

export async function addDrillToPlan(
  drillId: string,
  source?: PracticePlanItem['source'],
): Promise<PracticePlan> {
  const weekStartISO = getWeekStartISO();
  const existing = await loadPracticePlan();
  const basePlan: PracticePlan = existing?.weekStartISO === weekStartISO ? existing : { weekStartISO, items: [] };

  if (basePlan.items.some((item) => item.drillId === drillId)) {
    return basePlan;
  }

  const newItem: PracticePlanItem = {
    id: `${drillId}:${Date.now()}`,
    drillId,
    createdAt: new Date().toISOString(),
    source,
    status: 'planned',
  };

  const nextPlan: PracticePlan = { ...basePlan, items: [...basePlan.items, newItem] };
  await savePracticePlan(nextPlan);
  return nextPlan;
}
