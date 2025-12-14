import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SgLightExplainerModal } from '@app/components/SgLightExplainerModal';
import { useTrackOncePerKey } from '@app/hooks/useTrackOncePerKey';
import { t } from '@app/i18n';
import { safeEmit } from '@app/telemetry';
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightSummary,
  StrokesGainedLightTrend,
} from '@shared/stats/strokesGainedLight';
import {
  buildSgLightExplainerPayload,
  buildSgLightImpressionKey,
  type SgLightSurface,
} from '@shared/sgLight/analytics';
import { isSgLightInsightsEnabled } from '@shared/featureFlags/sgLightInsights';

type Props = {
  surface: SgLightSurface;
  contextId: string;
  summary?: StrokesGainedLightSummary | null;
  trend?: StrokesGainedLightTrend | null;
  loadingTrend?: boolean;
  onTrackSummaryImpression?: (summary: StrokesGainedLightSummary) => void;
  onTrackTrendImpression?: (
    focusCategory: StrokesGainedLightCategory,
    trend: StrokesGainedLightTrend,
  ) => void;
  practiceCtaLabel?: string | null;
  onPressPractice?: () => void;
  onTrackPracticeCta?: () => void;
};

function formatSgValue(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function sgLightSummaryHeadline(summary: StrokesGainedLightSummary): string | null {
  if (!summary.byCategory?.length) return null;
  const confident = summary.byCategory.filter((entry) => entry.confidence >= 0.3);
  if (!confident.length) return 'Not enough data yet';

  const focus = confident.reduce((acc, curr) => (Math.abs(curr.delta) > Math.abs(acc.delta) ? curr : acc));
  const labelMap: Record<string, string> = {
    tee: 'Tee',
    approach: 'Approach',
    short_game: 'Short game',
    putting: 'Putting',
  };
  const label = labelMap[focus.category] ?? focus.category;
  const deltaLabel = formatSgValue(focus.delta);
  return focus.delta >= 0 ? `You gained ${deltaLabel} on ${label}` : `You lost ${deltaLabel} on ${label}`;
}

function sgLightFocusLabel(category: StrokesGainedLightCategory | null | undefined): string | null {
  if (!category) return null;
  const map: Record<string, string> = {
    tee: 'Off the tee',
    approach: 'Approach shots',
    short_game: 'Short game',
    putting: 'Putting',
  };
  return map[category] ?? category;
}

function formatSgDelta(value?: number | null): string {
  if (typeof value !== 'number') return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function sgLightCategoryLabel(category: keyof StrokesGainedLightTrend['perCategory']): string {
  const key = {
    tee: 'round.story.sgLightTrendCategory.tee',
    approach: 'round.story.sgLightTrendCategory.approach',
    short_game: 'round.story.sgLightTrendCategory.short_game',
    putting: 'round.story.sgLightTrendCategory.putting',
  }[category];

  return t(key);
}

export function SgLightInsightsSection({
  surface,
  contextId,
  summary,
  trend,
  loadingTrend,
  onTrackSummaryImpression,
  onTrackTrendImpression,
  practiceCtaLabel,
  onPressPractice,
  onTrackPracticeCta,
}: Props): JSX.Element | null {
  const sgLightEnabled = isSgLightInsightsEnabled();
  const [explainerVisible, setExplainerVisible] = useState(false);

  const trendFocusCategory = trend?.focusHistory?.[0]?.focusCategory ?? null;
  const summaryKey = summary
    ? buildSgLightImpressionKey({
        surface,
        contextId,
        cardType: 'summary',
      })
    : null;
  const trendKey = trendFocusCategory
    ? buildSgLightImpressionKey({
        surface,
        contextId,
        cardType: 'trend',
        focusCategory: trendFocusCategory,
      })
    : null;
  const { fire: fireSummaryImpression } = useTrackOncePerKey(summaryKey);
  const { fire: fireTrendImpression } = useTrackOncePerKey(trendKey);

  useEffect(() => {
    if (!sgLightEnabled || !summary || !onTrackSummaryImpression) return;
    fireSummaryImpression(() => onTrackSummaryImpression(summary));
  }, [fireSummaryImpression, onTrackSummaryImpression, sgLightEnabled, summary]);

  useEffect(() => {
    if (!sgLightEnabled || !trend || !trendFocusCategory || !onTrackTrendImpression) return;
    fireTrendImpression(() => onTrackTrendImpression(trendFocusCategory, trend));
  }, [fireTrendImpression, onTrackTrendImpression, sgLightEnabled, trend, trendFocusCategory]);

  const handlePressPractice = useCallback(() => {
    onTrackPracticeCta?.();
    onPressPractice?.();
  }, [onPressPractice, onTrackPracticeCta]);

  const openExplainer = useCallback(() => {
    const payload = buildSgLightExplainerPayload({ surface, contextId });
    safeEmit('sg_light_explainer_opened', payload);
    setExplainerVisible(true);
  }, [contextId, surface]);

  const closeExplainer = useCallback(() => setExplainerVisible(false), []);

  const summaryBody = useMemo(() => {
    if (!sgLightEnabled || !summary) return null;
    const headline = sgLightSummaryHeadline(summary);
    const focusLabel = sgLightFocusLabel(summary.focusCategory ?? null);
    const opportunityLine = focusLabel ? `Biggest opportunity: ${focusLabel}` : null;
    const practiceLabel = practiceCtaLabel || (focusLabel ? `Practice ${focusLabel.toLowerCase()}` : null);
    const order: Array<StrokesGainedLightCategory> = ['tee', 'approach', 'short_game', 'putting'];

    return (
      <View style={recapStyles.sgLightCard} testID="sg-light-card">
        <View style={recapStyles.sgHeaderRow}>
          <View style={recapStyles.sgLabelRow}>
            <Text style={recapStyles.sgLabel}>Strokes Gained (Light)</Text>
            <TouchableOpacity
              onPress={openExplainer}
              accessibilityLabel={t('sg_light.explainer.open_label')}
              style={recapStyles.infoButton}
              testID="open-sg-light-explainer"
            >
              <Text style={recapStyles.infoIcon}>i</Text>
            </TouchableOpacity>
          </View>
          <Text style={recapStyles.sgValue}>{formatSgValue(summary.totalDelta)}</Text>
        </View>
        {headline ? <Text style={recapStyles.muted}>{headline}</Text> : null}
        {opportunityLine ? (
          <Text style={recapStyles.bodyText} testID="sg-light-opportunity">
            {opportunityLine}
          </Text>
        ) : null}
        <View style={recapStyles.grid}>
          {order.map((key) => {
            const entry = summary.byCategory?.find((c) => c.category === key);
            const confident = (entry?.confidence ?? 0) >= 0.3;
            return (
              <View key={`sg-light-${key}`} style={recapStyles.tile} testID={`recap-sg-light-${key}`}>
                <Text style={recapStyles.tileLabel}>{key.replace('_', ' ')}</Text>
                {entry ? (
                  <>
                    <Text
                      style={[
                        recapStyles.tileValue,
                        (entry.delta ?? 0) >= 0 ? recapStyles.sgPositive : recapStyles.sgNegative,
                      ]}
                    >
                      {confident ? formatSgValue(entry.delta ?? 0) : '—'}
                    </Text>
                    <Text style={recapStyles.muted}>
                      {confident
                        ? `${entry.shots} shots • ${(entry.confidence * 100).toFixed(0)}% confidence`
                        : 'Not enough data yet'}
                    </Text>
                  </>
                ) : (
                  <Text style={recapStyles.muted}>No data</Text>
                )}
              </View>
            );
          })}
        </View>
        {practiceLabel ? (
          <TouchableOpacity
            style={recapStyles.primaryCta}
            onPress={handlePressPractice}
            testID="sg-light-practice-cta"
          >
            <Text style={recapStyles.primaryCtaText}>{practiceLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [handlePressPractice, openExplainer, practiceCtaLabel, sgLightEnabled, summary]);

  const roundStoryTrend = useMemo(() => {
    if (!sgLightEnabled || surface !== 'round_story') return null;
    return (
      <View style={roundStoryStyles.section} testID="sg-light-trend">
        <View style={roundStoryStyles.sectionHeader}>
          <View style={roundStoryStyles.sectionTitleRow}>
            <Text style={roundStoryStyles.sectionTitle}>{t('round.story.sgLightTrendTitle')}</Text>
            <TouchableOpacity
              onPress={openExplainer}
              accessibilityLabel={t('sg_light.explainer.open_label')}
              style={roundStoryStyles.infoButton}
              testID="open-sg-light-explainer"
            >
              <Text style={roundStoryStyles.infoIcon}>i</Text>
            </TouchableOpacity>
          </View>
          {loadingTrend && <ActivityIndicator size="small" />}
        </View>
        <View style={roundStoryStyles.card}>
          {trend ? (
            <>
              {trend.windowSize ? (
                <Text style={roundStoryStyles.meta}>
                  {t('round.story.sgLightTrendSubtitle', { rounds: trend.windowSize })}
                </Text>
              ) : null}
              <View style={roundStoryStyles.chipGrid}>
                {(['tee', 'approach', 'short_game', 'putting'] as StrokesGainedLightCategory[]).map((category) => {
                  const entry = trend.perCategory?.[category];
                  const isFocus = trendFocusCategory === category;
                  return (
                    <View key={category} style={[roundStoryStyles.chip, isFocus && roundStoryStyles.focusChip]}>
                      <View style={roundStoryStyles.chipHeaderRow}>
                        <Text style={roundStoryStyles.chipLabel}>{sgLightCategoryLabel(category)}</Text>
                        {isFocus && (
                          <Text style={roundStoryStyles.focusBadge}>{t('round.story.sgLightTrendFocusBadge')}</Text>
                        )}
                      </View>
                      <Text style={roundStoryStyles.chipValue}>{formatSgDelta(entry?.avgDelta)}</Text>
                    </View>
                  );
                })}
              </View>

              {trend.focusHistory?.length ? (
                <View style={roundStoryStyles.focusHistory}>
                  <Text style={roundStoryStyles.meta}>{t('round.story.sgLightTrendFocusHistoryTitle')}</Text>
                  {trend.focusHistory.map((entry, idx) => (
                    <Text key={`${entry.roundId}-${idx}`} style={roundStoryStyles.listItem}>
                      • {sgLightCategoryLabel(entry.focusCategory)} · {entry.playedAt ?? ''}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={roundStoryStyles.meta}>{t('weeklySummary.notEnough')}</Text>
          )}
        </View>
      </View>
    );
  }, [loadingTrend, openExplainer, sgLightEnabled, trend, trendFocusCategory]);

  const playerStatsTrend = useMemo(() => {
    if (!sgLightEnabled || surface !== 'player_stats') return null;
    const focusCategory = trendFocusCategory;

    return (
      <View style={playerStatsStyles.card} testID="player-stats-sg-trend-card">
        <View style={playerStatsStyles.cardTitleRow}>
          <Text style={playerStatsStyles.cardTitle}>{t('stats.player.sg_light.trend_title')}</Text>
          <TouchableOpacity
            onPress={openExplainer}
            accessibilityLabel={t('sg_light.explainer.open_label')}
            style={playerStatsStyles.infoButton}
            testID="open-sg-light-explainer"
          >
            <Text style={playerStatsStyles.infoIcon}>i</Text>
          </TouchableOpacity>
        </View>
        {loadingTrend ? (
          <ActivityIndicator />
        ) : trend ? (
          <>
            <Text style={playerStatsStyles.muted}>
              {t('stats.player.sg_light.trend_subtitle', { rounds: trend.windowSize })}
            </Text>
            {focusCategory ? (
              <View style={playerStatsStyles.statRow}>
                <Text style={playerStatsStyles.statLabel} testID="player-stats-sg-trend-headline">
                  {t('stats.player.sg_light.trend_focus', {
                    focus: t(
                      focusCategory === 'tee' ? 'sg_light.focus.off_the_tee' : `sg_light.focus.${focusCategory}`,
                    ),
                  })}
                </Text>
                <Text style={playerStatsStyles.statValue}>
                  {formatSgDelta(trend.perCategory?.[focusCategory]?.avgDelta)}
                </Text>
              </View>
            ) : null}

            {trend.focusHistory?.length ? (
              <View style={playerStatsStyles.focusHistory}>
                <Text style={playerStatsStyles.muted}>{t('stats.player.sg_light.focus_history')}</Text>
                <View style={playerStatsStyles.focusBadges}>
                  {trend.focusHistory.slice(0, 4).map((entry) => (
                    <Text key={entry.roundId} style={playerStatsStyles.focusBadge}>
                      {t(entry.focusCategory === 'tee' ? 'sg_light.focus.off_the_tee' : `sg_light.focus.${entry.focusCategory}`)}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {focusCategory ? (
              <TouchableOpacity
                style={[playerStatsStyles.primaryCta, playerStatsStyles.secondaryButton]}
                onPress={handlePressPractice}
                accessibilityLabel={t('stats.player.sg_light.practice_cta')}
                testID="player-stats-sg-trend-cta"
              >
                <Text style={playerStatsStyles.primaryCtaText}>{t('stats.player.sg_light.practice_cta')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <Text style={playerStatsStyles.muted}>{t('stats.player.sg_light.trend_empty')}</Text>
        )}
      </View>
    );
  }, [handlePressPractice, loadingTrend, openExplainer, sgLightEnabled, trend, trendFocusCategory]);

  if (!sgLightEnabled) {
    return null;
  }

  if (!summaryBody && !roundStoryTrend && !playerStatsTrend) {
    return null;
  }

  return (
    <>
      {summaryBody}
      {roundStoryTrend}
      {playerStatsTrend}
      <SgLightExplainerModal visible={explainerVisible} onClose={closeExplainer} t={t} />
    </>
  );
}

const recapStyles = StyleSheet.create({
  sgLightCard: { gap: 8 },
  sgHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sgLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sgLabel: { color: '#111827', fontWeight: '600' },
  sgValue: { fontSize: 20, fontWeight: '700' },
  infoButton: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f8fafc',
  },
  infoIcon: { color: '#0f172a', fontWeight: '700' },
  muted: { color: '#6b7280' },
  bodyText: { color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  tileLabel: { fontWeight: '600', color: '#111827' },
  tileValue: { color: '#374151' },
  sgPositive: { color: '#047857' },
  sgNegative: { color: '#b91c1c' },
  primaryCta: { backgroundColor: '#0f172a', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryCtaText: { color: '#fff', fontWeight: '700' },
});

const roundStoryStyles = StyleSheet.create({
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  infoIcon: { color: '#0f172a', fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  meta: { color: '#64748b' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    minWidth: 130,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  focusChip: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  chipHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  chipLabel: { fontWeight: '700', color: '#0f172a' },
  chipValue: { color: '#0f172a' },
  focusBadge: {
    backgroundColor: '#0ea5e9',
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  focusHistory: { marginTop: 10, gap: 4 },
  listItem: { color: '#0f172a' },
});

const playerStatsStyles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  infoIcon: { color: '#111827', fontWeight: '700' },
  muted: { color: '#6b7280' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { color: '#374151' },
  statValue: { fontWeight: '700', fontSize: 16 },
  focusHistory: { gap: 4 },
  focusBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: '#111827',
    fontWeight: '600',
  },
  primaryCta: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryCtaText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { marginTop: 8 },
});

