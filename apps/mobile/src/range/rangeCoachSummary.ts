import { t as defaultT } from '@app/i18n';
import { getMissionById } from '@app/range/rangeMissions';
import type { RangeMissionState } from '@app/range/rangeMissionsStorage';
import type { RangeHistoryEntry } from '@app/range/rangeHistoryStorage';
import { computeRangeProgressStats } from '@app/range/rangeProgressStats';
import type { RangeSessionSummary } from '@app/range/rangeSession';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import type { TrainingGoal } from '@app/range/rangeTrainingGoalStorage';

type Translator = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;

export interface CoachSummaryContext {
  history: RangeHistoryEntry[];
  trainingGoal: TrainingGoal | null;
  missionState: RangeMissionState;
}

const COACH_SUMMARY_RECENT_SESSIONS = 3;

function parseDate(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function entryTimestamp(entry: RangeHistoryEntry): number {
  return parseDate(entry.savedAt || entry.summary.finishedAt || entry.summary.startedAt);
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveMissionTitle(missionId: string | undefined, translate: Translator): string | null {
  if (!missionId) return null;
  const mission = getMissionById(missionId);
  if (mission?.titleKey) return translate(mission.titleKey as any);
  return missionId;
}

function formatPeriod(
  firstSessionDate: string | undefined,
  lastSessionDate: string | undefined,
  translate: Translator,
): string | null {
  const start = formatDate(firstSessionDate);
  const end = formatDate(lastSessionDate);

  if (start && end) {
    if (start === end) return translate('range.coachSummary.share_period_single', { date: start });
    return translate('range.coachSummary.share_period_range', { start, end });
  }

  if (start) return translate('range.coachSummary.share_period_single', { date: start });
  if (end) return translate('range.coachSummary.share_period_single', { date: end });
  return null;
}

function formatClubLine(
  clubs: Array<{ club: string; shotCount: number }>,
  translate: Translator,
): string | null {
  if (!clubs.length) return null;
  const label = clubs.map((item) => `${item.club} (${item.shotCount})`).join(', ');
  return translate('range.coachSummary.share_clubs_line', { clubs: label });
}

function sessionMissionLabel(summary: RangeSessionSummary, translate: Translator): string {
  const missionTitleKey = summary.missionTitleKey || getMissionById(summary.missionId ?? '')?.titleKey;
  const missionTitle = missionTitleKey ? translate(missionTitleKey as any) : resolveMissionTitle(summary.missionId, translate);
  return missionTitle ?? translate('range.coachSummary.share_session_mission_none');
}

function formatSessionHeader(entry: RangeHistoryEntry, index: number, translate: Translator): string {
  const date = formatDate(entry.savedAt || entry.summary.finishedAt || entry.summary.startedAt) ?? '-';
  const club = entry.summary.club?.trim() || translate('home.range.lastSession.anyClub');
  const mission = sessionMissionLabel(entry.summary, translate);
  const shots = typeof entry.summary.shotCount === 'number' ? entry.summary.shotCount : 0;

  return translate('range.coachSummary.share_session_line', { index, date, club, shots, mission });
}

function formatSessionDetail(entry: RangeHistoryEntry, translate: Translator): string[] {
  const story = buildRangeSessionStory(entry.summary);
  const storyTitle = translate(story.titleKey as any);
  const lines = [translate('range.coachSummary.share_session_story', { storyTitle })];

  if (typeof entry.summary.sessionRating === 'number') {
    lines.push(translate('range.coachSummary.share_session_rating', { rating: entry.summary.sessionRating }));
  }

  const notes = entry.summary.reflectionNotes?.trim() || entry.summary.trainingGoalText?.trim();
  lines.push(
    translate('range.coachSummary.share_session_notes', {
      notes: notes || translate('range.coachSummary.share_session_notes_none'),
    }),
  );

  return lines;
}

export function pickRecentCoachSummarySessions(
  history: RangeHistoryEntry[],
  count = COACH_SUMMARY_RECENT_SESSIONS,
): RangeHistoryEntry[] {
  return [...history]
    .sort((a, b) => entryTimestamp(b) - entryTimestamp(a))
    .slice(0, Math.max(0, count));
}

export function formatCoachSummaryText(ctx: CoachSummaryContext, translate: Translator = defaultT): string {
  const stats = computeRangeProgressStats(ctx.history);
  const lines: string[] = [translate('range.coachSummary.share_heading')];

  lines.push(
    ctx.trainingGoal?.text
      ? translate('range.coachSummary.share_current_goal', { text: ctx.trainingGoal.text })
      : translate('range.coachSummary.share_current_goal_none'),
  );

  const pinnedMissionTitle = resolveMissionTitle(ctx.missionState.pinnedMissionId, translate);
  lines.push(
    pinnedMissionTitle
      ? translate('range.coachSummary.share_pinned_mission', { title: pinnedMissionTitle })
      : translate('range.coachSummary.share_pinned_mission_none'),
  );

  if (stats.sessionCount === 0) {
    lines.push(translate('range.coachSummary.share_recent_empty'));
    return lines.join('\n');
  }

  lines.push(
    translate('range.coachSummary.share_overview', {
      sessions: stats.sessionCount,
      shots: stats.totalRecordedShots,
    }),
  );

  const periodLine = formatPeriod(stats.firstSessionDate, stats.lastSessionDate, translate);
  if (periodLine) lines.push(periodLine);

  const clubsLine = formatClubLine(stats.mostRecordedClubs, translate);
  if (clubsLine) lines.push(clubsLine);

  lines.push(translate('range.coachSummary.share_recent_heading'));

  const recentSessions = pickRecentCoachSummarySessions(ctx.history);
  recentSessions.forEach((entry, index) => {
    lines.push(formatSessionHeader(entry, index + 1, translate));
    lines.push(...formatSessionDetail(entry, translate));
  });

  return lines.join('\n');
}

export { COACH_SUMMARY_RECENT_SESSIONS };
