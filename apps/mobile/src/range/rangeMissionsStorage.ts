import { getItem, setItem } from '@app/storage/asyncStorage';

export interface RangeMissionCompletion {
  missionId: string;
  completedAt: string;
}

export interface RangeMissionState {
  completedMissionIds: string[];
  pinnedMissionId?: string;
}

const RANGE_MISSIONS_STATE_KEY = 'golfiq.range.missions.state.v1';

function parseState(raw: string): RangeMissionState {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { completedMissionIds: [] };

    const completedMissionIds = Array.isArray((parsed as RangeMissionState).completedMissionIds)
      ? (parsed as RangeMissionState).completedMissionIds.filter((id): id is string => typeof id === 'string')
      : [];

    const pinnedMissionId = (parsed as RangeMissionState).pinnedMissionId;

    return {
      completedMissionIds,
      pinnedMissionId: typeof pinnedMissionId === 'string' ? pinnedMissionId : undefined,
    };
  } catch {
    return { completedMissionIds: [] };
  }
}

export async function loadRangeMissionState(): Promise<RangeMissionState> {
  const raw = await getItem(RANGE_MISSIONS_STATE_KEY);
  if (!raw) return { completedMissionIds: [] };
  return parseState(raw);
}

export async function toggleMissionCompleted(missionId: string): Promise<RangeMissionState> {
  const current = await loadRangeMissionState();
  const isCompleted = current.completedMissionIds.includes(missionId);
  const completedMissionIds = isCompleted
    ? current.completedMissionIds.filter((id) => id !== missionId)
    : [...current.completedMissionIds, missionId];

  const next: RangeMissionState = {
    ...current,
    completedMissionIds,
  };

  await setItem(RANGE_MISSIONS_STATE_KEY, JSON.stringify(next));
  return next;
}

export async function setPinnedMission(missionId: string | undefined): Promise<RangeMissionState> {
  const current = await loadRangeMissionState();
  const next: RangeMissionState = {
    ...current,
    pinnedMissionId: missionId || undefined,
  };

  await setItem(RANGE_MISSIONS_STATE_KEY, JSON.stringify(next));
  return next;
}
