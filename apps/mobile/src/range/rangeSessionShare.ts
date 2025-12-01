import type { RangeSessionSummary } from '@app/range/rangeSession';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import { t as defaultT } from '@app/i18n';

type Translator = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;

function formatDate(value?: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCarry(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${Math.round(value)} m`;
}

export function formatRangeSessionShareText(
  summary: RangeSessionSummary,
  translate: Translator = defaultT,
): string {
  const story = buildRangeSessionStory(summary);

  const focusLabel =
    story.focusArea === 'direction'
      ? translate('range.sessionDetail.share_text.focus_direction')
      : story.focusArea === 'distance'
        ? translate('range.sessionDetail.share_text.focus_distance')
        : translate('range.sessionDetail.share_text.focus_contact');

  const completedAt = summary.finishedAt ?? summary.startedAt;
  const clubLabel = summary.club?.trim() || translate('home.range.lastSession.anyClub');

  const lines = [
    translate('range.sessionDetail.share_text.heading'),
    translate('range.sessionDetail.share_text.training_goal', {
      text: summary.trainingGoalText?.trim() || '—',
    }),
    translate('range.sessionDetail.share_text.date', { date: formatDate(completedAt) }),
    translate('range.sessionDetail.share_text.club', { club: clubLabel }),
    translate('range.sessionDetail.share_text.shots', { count: summary.shotCount }),
    translate('range.sessionDetail.share_text.avg_carry', { meters: formatCarry(summary.avgCarryM) }),
    translate('range.sessionDetail.share_text.focus', { focus: focusLabel }),
    translate('range.sessionDetail.share_text.notes', { title: translate(story.titleKey) }),
  ];

  return lines.join('\n');
}
