import { buildBagPracticeRecommendations } from '@shared/caddie/bagPracticeRecommendations';
import type { BagReadinessOverview } from '@shared/caddie/bagReadiness';
import { DEFAULT_HISTORY_WINDOW_DAYS, type MissionProgress } from './practiceHistory';

export type PracticeMissionId = string;

export type PracticeMissionDefinition = {
  id: PracticeMissionId;
  titleKey?: string;
  title?: string;
  descriptionKey?: string;
};

export type MissionProgressById = Record<string, MissionProgress | undefined>;

export type PracticeMissionListItem = {
  id: PracticeMissionId;
  title: string;
  subtitleKey: string;
  status: 'overdue' | 'recommended' | 'dueSoon' | 'onTrack' | 'completedRecently';
  priorityScore: number;
  lastCompletedAt: number | null;
  completionCount: number;
  inStreak: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function mapStatusToPriority(status: PracticeMissionListItem['status']): number {
  switch (status) {
    case 'overdue':
      return 50;
    case 'recommended':
      return 40;
    case 'dueSoon':
      return 30;
    case 'onTrack':
      return 20;
    case 'completedRecently':
      return 10;
    default:
      return 0;
  }
}

function resolveTitle(def: PracticeMissionDefinition): string {
  if (def.title) return def.title;
  if (def.titleKey) return def.titleKey;
  return def.id;
}

function inferStatus(
  missionId: string,
  progress: MissionProgress,
  options: { highlighted?: Set<string>; now: Date },
): PracticeMissionListItem['status'] {
  const { highlighted = new Set<string>(), now } = options;
  const nowMs = now.getTime();
  const lastCompletedAt = progress.lastCompletedAt;

  if (highlighted.has(missionId)) {
    if (!lastCompletedAt || nowMs - lastCompletedAt > 7 * DAY_MS) return 'overdue';
    return 'recommended';
  }

  if (!lastCompletedAt) return 'dueSoon';

  const daysSince = (nowMs - lastCompletedAt) / DAY_MS;
  if (daysSince <= 2) return 'completedRecently';
  if (daysSince > DEFAULT_HISTORY_WINDOW_DAYS) return 'dueSoon';

  return progress.inStreak ? 'onTrack' : 'dueSoon';
}

export function buildPracticeMissionsList(options: {
  bagReadiness: BagReadinessOverview | null;
  missionProgressById: MissionProgressById;
  missions: PracticeMissionDefinition[];
  now?: Date;
}): PracticeMissionListItem[] {
  const { bagReadiness, missionProgressById, missions, now = new Date() } = options;

  const highlightedMissions = new Set<string>();
  if (bagReadiness) {
    const recs = buildBagPracticeRecommendations(bagReadiness, bagReadiness.suggestions, [], { now });
    recs.slice(0, 3).forEach((rec) => highlightedMissions.add(rec.id));
  }

  const items: PracticeMissionListItem[] = missions.map((mission, index) => {
    const progress = missionProgressById[mission.id] ?? {
      missionId: mission.id,
      completedSessions: 0,
      lastCompletedAt: null,
      inStreak: false,
    };

    const status = inferStatus(mission.id, progress, { highlighted: highlightedMissions, now });
    const priorityScore = mapStatusToPriority(status) + (highlightedMissions.has(mission.id) ? 25 : 0);

    return {
      id: mission.id,
      title: resolveTitle(mission),
      subtitleKey: `practice.missions.status.${status}`,
      status,
      priorityScore,
      lastCompletedAt: progress.lastCompletedAt,
      completionCount: progress.completedSessions,
      inStreak: progress.inStreak,
    };
  });

  const statusOrder: PracticeMissionListItem['status'][] = [
    'overdue',
    'recommended',
    'dueSoon',
    'onTrack',
    'completedRecently',
  ];

  return items.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const statusDiff = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;
    if (a.lastCompletedAt !== b.lastCompletedAt) {
      if (a.lastCompletedAt == null) return -1;
      if (b.lastCompletedAt == null) return 1;
      return a.lastCompletedAt - b.lastCompletedAt;
    }
    return a.id.localeCompare(b.id);
  });
}
