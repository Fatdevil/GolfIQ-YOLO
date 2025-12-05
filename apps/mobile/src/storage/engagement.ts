import { getItem, setItem } from '@app/storage/asyncStorage';

const KEY = 'engagement/state';

export type EngagementState = {
  lastSeenWeeklySummaryAt?: string;
  lastSeenCoachReportRoundId?: string;
};

export async function loadEngagementState(): Promise<EngagementState> {
  const raw = await getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function saveEngagementState(update: Partial<EngagementState>): Promise<void> {
  const current = await loadEngagementState();
  const next: EngagementState = { ...current, ...update };
  await setItem(KEY, JSON.stringify(next));
}
