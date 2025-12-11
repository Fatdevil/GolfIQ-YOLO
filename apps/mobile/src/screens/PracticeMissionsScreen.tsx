import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { PRACTICE_MISSION_WINDOW_DAYS, loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import { buildBagReadinessOverview, type BagReadinessOverview } from '@shared/caddie/bagReadiness';
import type { BagSuggestion } from '@shared/caddie/bagTuningSuggestions';
import {
  PRACTICE_WEEK_WINDOW_DAYS,
  buildMissionProgressById,
  buildWeeklyPracticeHistory,
  type PracticeMissionHistoryEntry,
  type WeeklyPracticeHistorySummary,
} from '@shared/practice/practiceHistory';
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from '@shared/practice/practiceMissionsList';
import { buildPracticeReadinessSummary } from '@shared/practice/practiceReadiness';
import {
  buildWeeklyPracticePlanStatus,
  type WeeklyPracticePlanStatus,
} from '@shared/practice/practicePlan';
import { buildWeeklyPracticeComparison } from '@shared/practice/practiceInsights';
import { emitWeeklyPracticeInsightsViewed } from '@shared/practice/practiceInsightsAnalytics';
import { emitWeeklyPracticeHistoryViewed } from '@shared/practice/practiceHistoryAnalytics';
import { safeEmit } from '@app/telemetry';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';
import { buildPracticeDecisionContext } from '@shared/practice/practiceDecisionContext';
import { recommendPracticeMissions, type RecommendedMission } from '@shared/practice/recommendPracticeMissions';
import {
  emitPracticeMissionRecommendationClicked,
  emitPracticeMissionRecommendationShown,
  type PracticeRecommendationContext,
} from '@shared/practice/practiceRecommendationsAnalytics';
import { emitPracticeMissionStart } from '@shared/practice/practiceSessionAnalytics';
import { getPracticeRecommendationsExperiment } from '@shared/experiments/flags';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>;

type ScreenState = {
  loading: boolean;
  missions: PracticeMissionListItem[];
  history: PracticeMissionHistoryEntry[];
};

type WeeklyPracticeInsightsCardProps = {
  comparison: ReturnType<typeof buildWeeklyPracticeComparison>;
};

type WeeklyHistorySectionProps = {
  summaries: WeeklyPracticeHistorySummary[];
};

function WeeklyPracticeInsightsCard({ comparison }: WeeklyPracticeInsightsCardProps): JSX.Element {
  const hasHistory =
    comparison.thisWeek.missionsCompleted > 0 || comparison.lastWeek.missionsCompleted > 0;

  if (!hasHistory) {
    return (
      <View style={styles.insightsCard} testID="practice-weekly-insights">
        <Text style={styles.insightsTitle}>{t('weekly_insights_title')}</Text>
        <Text style={styles.insightsEmpty}>{t('weekly_insights_empty')}</Text>
      </View>
    );
  }

  const renderRow = (
    label: string,
    snapshot: ReturnType<typeof buildWeeklyPracticeComparison>['thisWeek'],
    testId: string,
  ) => (
    <View style={styles.insightsRow} testID={testId}>
      <Text style={styles.insightsLabel}>{label}</Text>
      <Text style={snapshot.goalReached ? styles.insightsPositive : styles.insightsNeutral}>
        {snapshot.goalReached
          ? t('weekly_insights_goal_reached')
          : t('weekly_insights_goal_not_reached')}
      </Text>
      <Text style={snapshot.planCompleted ? styles.insightsPositive : styles.insightsNeutral}>
        {snapshot.planCompleted
          ? t('weekly_insights_plan_completed')
          : t('weekly_insights_plan_not_completed')}
      </Text>
    </View>
  );

  return (
    <View style={styles.insightsCard} testID="practice-weekly-insights">
      <Text style={styles.insightsTitle}>{t('weekly_insights_title')}</Text>
      {renderRow(
        t('weekly_insights_this_week', { missions: comparison.thisWeek.missionsCompleted }),
        comparison.thisWeek,
        'weekly-insights-this-week',
      )}
      {renderRow(
        t('weekly_insights_last_week', { missions: comparison.lastWeek.missionsCompleted }),
        comparison.lastWeek,
        'weekly-insights-last-week',
      )}
    </View>
  );
}

function formatWeekRange(start: Date): { from: string; to: string } {
  const end = new Date(start);
  end.setDate(end.getDate() + PRACTICE_WEEK_WINDOW_DAYS - 1);

  return {
    from: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    to: end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

function WeeklyHistorySection({ summaries }: WeeklyHistorySectionProps): JSX.Element {
  return (
    <View style={styles.historySection} testID="practice-weekly-history">
      <Text style={styles.historyTitle}>{t('weekly_history_title')}</Text>
      {summaries.length === 0 ? (
        <Text style={styles.historyEmpty}>{t('weekly_history_empty')}</Text>
      ) : (
        <View style={styles.historyList}>
          {summaries.map((summary, index) => {
            const { from, to } = formatWeekRange(summary.weekStart);
            const label =
              index === 0
                ? t('weekly_history_this_week')
                : index === 1
                  ? t('weekly_history_last_week')
                  : t('weekly_history_range', { from, to });

            return (
              <View style={styles.historyCard} key={summary.weekStart.getTime()} testID={`weekly-history-item-${index}`}>
                <Text style={styles.historyLabel}>{label}</Text>
                <Text style={styles.historyCounts}>
                  {t('weekly_history_counts', { completed: summary.completedCount, target: summary.target })}
                </Text>
                <Text style={summary.goalReached ? styles.historyPositive : styles.historyNeutral}>
                  {summary.goalReached ? t('weekly_history_goal_reached') : t('weekly_history_goal_not_reached')}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function formatDate(value: number | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function mapSuggestionToMissionDefinition(suggestion: BagSuggestion): PracticeMissionDefinition | null {
  if (suggestion.type === 'fill_gap' && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_fill_gap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
    };
  }

  if (suggestion.type === 'reduce_overlap' && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_reduce_overlap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: 'bag.practice.reduce_overlap.title',
      descriptionKey: 'bag.practice.reduce_overlap.description',
    };
  }

  if (suggestion.type === 'calibrate' && suggestion.clubId) {
    return {
      id: `practice_calibrate:${suggestion.clubId}`,
      titleKey: 'bag.practice.calibrate.title',
      descriptionKey: 'bag.practice.calibrate.more_samples.description',
    };
  }

  return null;
}

function buildMissionDefinitions(
  bagReadiness: BagReadinessOverview | null,
  history: PracticeMissionHistoryEntry[],
): PracticeMissionDefinition[] {
  const map = new Map<string, PracticeMissionDefinition>();

  bagReadiness?.suggestions?.forEach((suggestion) => {
    const def = mapSuggestionToMissionDefinition(suggestion);
    if (def) map.set(def.id, def);
  });

  history.forEach((entry) => {
    if (!map.has(entry.missionId)) {
      map.set(entry.missionId, { id: entry.missionId, title: entry.missionId });
    }
  });

  return Array.from(map.values());
}

function MissionRow({
  item,
  onPress,
  completionLabel,
  completionLabelVariant,
  recommendedReason,
}: {
  item: PracticeMissionListItem;
  onPress: () => void;
  completionLabel?: string;
  completionLabelVariant?: 'complete' | 'incomplete';
  recommendedReason?: RecommendedMission['reason'];
}): JSX.Element {
  const lastCompletedLabel = useMemo(() => formatDate(item.lastCompletedAt), [item.lastCompletedAt]);
  const recommendedReasonLabel = useMemo(() => {
    if (!recommendedReason) return null;
    switch (recommendedReason) {
      case 'focus_area':
        return t('practice.missionRecommendations.reason.focus_area');
      case 'goal_progress':
        return t('practice.missionRecommendations.reason.goal_progress');
      default:
        return t('practice.missionRecommendations.reason.fallback');
    }
  }, [recommendedReason]);

  return (
    <TouchableOpacity onPress={onPress} testID={`practice-mission-item-${item.id}`}>
      <View style={styles.item}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <View style={styles.itemHeaderRight}>
            {recommendedReason ? (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>{t('practice.missionRecommendations.badge')}</Text>
              </View>
            ) : null}
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{t(item.subtitleKey)}</Text>
            </View>
          </View>
        </View>
        {lastCompletedLabel ? (
          <Text style={styles.meta}>{`${t('practice.history.detail.endedAt')}: ${lastCompletedLabel}`}</Text>
        ) : (
          <Text style={styles.meta}>{t('practice.history.detail.unknown')}</Text>
        )}
        {recommendedReasonLabel ? <Text style={styles.recommendedReason}>{recommendedReasonLabel}</Text> : null}
        {completionLabel ? (
          <Text
            style={[
              styles.meta,
              completionLabelVariant === 'complete' ? styles.completeLabel : styles.incompleteLabel,
            ]}
          >
            {completionLabel}
          </Text>
        ) : null}
        {item.inStreak ? <Text style={styles.streak}>{t('practice.history.streakTag')}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function PracticeMissionsScreen({ navigation, route }: Props): JSX.Element {
  const [state, setState] = useState<ScreenState>({ loading: true, missions: [], history: [] });
  const viewedRef = useRef(false);
  const planViewedRef = useRef(false);
  const planCompletedViewedRef = useRef(false);
  const insightsViewedRef = useRef(false);
  const historyViewedRef = useRef(false);
  const [weeklyGoalSettings, setWeeklyGoalSettings] = useState(
    getDefaultWeeklyPracticeGoalSettings(),
  );

  const practiceRecommendationsExperiment = useMemo(
    () => getPracticeRecommendationsExperiment('anonymous'),
    [],
  );

  const practiceReadinessSummary = useMemo(
    () => buildPracticeReadinessSummary({ history: state.history, goalSettings: weeklyGoalSettings }),
    [state.history, weeklyGoalSettings],
  );

  const practiceDecisionContext = useMemo(
    () => buildPracticeDecisionContext({ summary: practiceReadinessSummary }),
    [practiceReadinessSummary],
  );

  const practiceRecommendations = useMemo(
    () =>
      state.loading || !practiceRecommendationsExperiment.enabled
        ? []
        : recommendPracticeMissions({
            context: practiceDecisionContext,
            missions: state.missions.map((mission) => ({
              id: mission.id,
              focusArea: (mission as any).focusArea,
            })),
            maxResults: 3,
          }),
    [
      practiceDecisionContext,
      practiceRecommendationsExperiment.enabled,
      state.loading,
      state.missions,
    ],
  );

  const recommendationByMissionId = useMemo(() => {
    const map = new Map<string, RecommendedMission>();
    if (practiceRecommendationsExperiment.enabled) {
      practiceRecommendations.forEach((rec) => {
        map.set(rec.id, rec);
      });
    }
    return map;
  }, [practiceRecommendations, practiceRecommendationsExperiment.enabled, state.missions]);

  const recommendationImpressionsSentRef = useRef(new Set<string>());

  useEffect(() => {
    if (
      state.loading ||
      practiceRecommendations.length === 0 ||
      !practiceRecommendationsExperiment.enabled
    )
      return;

    practiceRecommendations.forEach((rec) => {
      if (recommendationImpressionsSentRef.current.has(rec.id)) return;
      const mission = state.missions.find((candidate) => candidate.id === rec.id);
      emitPracticeMissionRecommendationShown(
        { emit: safeEmit },
        {
          missionId: rec.id,
          reason: rec.reason,
          rank: rec.rank,
          surface: 'mobile_practice_missions',
          focusArea: (mission as any)?.focusArea,
          algorithmVersion: 'v1',
          experiment: {
            experimentKey: practiceRecommendationsExperiment.experimentKey,
            experimentBucket: practiceRecommendationsExperiment.experimentBucket,
            experimentVariant: practiceRecommendationsExperiment.experimentVariant,
          },
        },
      );
      recommendationImpressionsSentRef.current.add(rec.id);
    });
  }, [
    practiceRecommendations,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
    practiceRecommendationsExperiment.enabled,
    state.loading,
    state.missions,
  ]);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    safeEmit('practice_missions_viewed', { surface: 'mobile', source: route.params?.source ?? 'other' });
  }, [route.params?.source]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const historyPromise = loadPracticeMissionHistory();
        const bagPromise = fetchPlayerBag().catch(
          () => null as Awaited<ReturnType<typeof fetchPlayerBag>> | null,
        );
        const bagStatsPromise = fetchBagStats().catch(
          () => null as Awaited<ReturnType<typeof fetchBagStats>> | null,
        );

        const [history, bag, bagStats, settings] = await Promise.all([
          historyPromise,
          bagPromise,
          bagStatsPromise,
          loadWeeklyPracticeGoalSettings().catch((err) => {
            console.warn('[practice] Failed to load weekly goal settings', err);
            return getDefaultWeeklyPracticeGoalSettings();
          }),
        ] as const);

        if (cancelled) return;

        const bagReadiness = bag ? buildBagReadinessOverview(bag, bagStats ?? {}) : null;
        const missions = buildMissionDefinitions(bagReadiness, history);
        const missionProgressById = buildMissionProgressById(
          history,
          missions.map((mission) => mission.id),
          { windowDays: PRACTICE_MISSION_WINDOW_DAYS },
        );

        const prioritizedMissions = buildPracticeMissionsList({
          bagReadiness,
          missionProgressById,
          missions,
        });

        setState({ loading: false, missions: prioritizedMissions, history });
        setWeeklyGoalSettings(settings ?? getDefaultWeeklyPracticeGoalSettings());
      } catch (err) {
        if (!cancelled) {
          console.warn('[practice] Failed to load missions screen', err);
          setState({ loading: false, missions: [], history: [] });
          setWeeklyGoalSettings(getDefaultWeeklyPracticeGoalSettings());
        }
      }
    };

    load().catch((err) => console.warn('[practice] missions screen crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyPlanStatus: WeeklyPracticePlanStatus = useMemo(
    () =>
      buildWeeklyPracticePlanStatus({
        missions: state.missions,
        history: state.history,
        targetMissionsPerWeek: weeklyGoalSettings.targetMissionsPerWeek,
      }),
    [state.history, state.missions, weeklyGoalSettings.targetMissionsPerWeek],
  );

  const weeklyComparison = useMemo(
    () =>
      buildWeeklyPracticeComparison({
        history: state.history,
        missions: state.missions,
        targetMissionsPerWeek: weeklyGoalSettings.targetMissionsPerWeek,
      }),
    [state.history, state.missions, weeklyGoalSettings.targetMissionsPerWeek],
  );

  const weeklyHistory = useMemo(
    () =>
      buildWeeklyPracticeHistory({
        history: state.history,
        settings: weeklyGoalSettings,
        now: new Date(),
      }),
    [state.history, weeklyGoalSettings],
  );

  const weeklyPlanMissions = weeklyPlanStatus.missions;
  const weeklyPlanIds = useMemo(() => new Set(weeklyPlanMissions.map((mission) => mission.id)), [weeklyPlanMissions]);
  const remainingMissions = useMemo(
    () => state.missions.filter((mission) => !weeklyPlanIds.has(mission.id)),
    [state.missions, weeklyPlanIds],
  );

  useEffect(() => {
    if (state.loading || weeklyPlanStatus.totalCount === 0 || planViewedRef.current) return;
    planViewedRef.current = true;
    safeEmit('practice_plan_viewed', {
      entryPoint: 'practice_missions',
      missionsInPlan: weeklyPlanStatus.totalCount,
    });
  }, [state.loading, weeklyPlanStatus.totalCount]);

  useEffect(() => {
    if (state.loading || insightsViewedRef.current) return;
    insightsViewedRef.current = true;

    emitWeeklyPracticeInsightsViewed(
      { emit: safeEmit },
      {
        thisWeekMissions: weeklyComparison.thisWeek.missionsCompleted,
        lastWeekMissions: weeklyComparison.lastWeek.missionsCompleted,
        thisWeekGoalReached: weeklyComparison.thisWeek.goalReached,
        lastWeekGoalReached: weeklyComparison.lastWeek.goalReached,
        thisWeekPlanCompleted: weeklyComparison.thisWeek.planCompleted,
        lastWeekPlanCompleted: weeklyComparison.lastWeek.planCompleted,
        surface: 'practice_missions_mobile',
      },
    );
  }, [state.loading, weeklyComparison]);

  useEffect(() => {
    if (state.loading || historyViewedRef.current) return;
    historyViewedRef.current = true;

    emitWeeklyPracticeHistoryViewed(
      { emit: safeEmit },
      { surface: 'mobile_practice_missions', weeks: weeklyHistory.length },
    );
  }, [state.loading, weeklyHistory.length]);

  useEffect(() => {
    if (state.loading || !weeklyPlanStatus.isPlanCompleted || planCompletedViewedRef.current) return;
    planCompletedViewedRef.current = true;
    safeEmit('practice_plan_completed_viewed', {
      entryPoint: 'practice_missions',
      completedMissions: weeklyPlanStatus.completedCount,
      totalMissions: weeklyPlanStatus.totalCount,
      isPlanCompleted: weeklyPlanStatus.isPlanCompleted,
    });
  }, [state.loading, weeklyPlanStatus]);

  const handleSelectMission = (missionId: string, planRank?: number) => {
    const recommendation = recommendationByMissionId.get(missionId);
    const mission = state.missions.find((candidate) => candidate.id === missionId);
    let recommendationContext: PracticeRecommendationContext | undefined;

    if (recommendation && practiceRecommendationsExperiment.enabled) {
      recommendationContext = {
        source: 'practice_recommendations',
        rank: recommendation.rank,
        focusArea: (mission as any)?.focusArea,
        reasonKey: recommendation.reason,
        algorithmVersion: 'v1',
        experiment: {
          experimentKey: practiceRecommendationsExperiment.experimentKey,
          experimentBucket: practiceRecommendationsExperiment.experimentBucket,
          experimentVariant: practiceRecommendationsExperiment.experimentVariant,
        },
      };
    }

    if (recommendation && practiceRecommendationsExperiment.enabled) {
      emitPracticeMissionRecommendationClicked(
        { emit: safeEmit },
        {
          missionId,
          reason: recommendation.reason,
          rank: recommendation.rank,
          surface: 'mobile_practice_missions',
          entryPoint: planRank != null ? 'weekly_plan' : 'missions_list',
          focusArea: (mission as any)?.focusArea,
          algorithmVersion: 'v1',
          experiment: {
            experimentKey: practiceRecommendationsExperiment.experimentKey,
            experimentBucket: practiceRecommendationsExperiment.experimentBucket,
            experimentVariant: practiceRecommendationsExperiment.experimentVariant,
          },
        },
      );
    }

    if (planRank != null) {
      safeEmit('practice_plan_mission_start', {
        entryPoint: 'practice_missions',
        missionId,
        planRank,
      });
    }

    emitPracticeMissionStart(
      { emit: safeEmit },
      { missionId, sourceSurface: 'missions_list', recommendation: recommendationContext },
    );

    const latestEntry = [...state.history]
      .filter((entry) => entry.missionId === missionId)
      .sort((a, b) => new Date(b.endedAt ?? b.startedAt).getTime() - new Date(a.endedAt ?? a.startedAt).getTime())[0];

    if (latestEntry) {
      navigation.navigate('PracticeMissionDetail', { entryId: latestEntry.id });
      return;
    }

    navigation.navigate('RangeQuickPracticeStart', {
      missionId,
      entrySource: 'missions',
      practiceRecommendationContext: recommendationContext,
    });
  };

  if (state.loading) {
    return (
      <View style={styles.container} testID="practice-missions-loading">
        <ActivityIndicator />
        <Text style={styles.loading}>{t('practice.history.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('practice.missions.title')}</Text>
      <WeeklyPracticeInsightsCard comparison={weeklyComparison} />
      <WeeklyHistorySection summaries={weeklyHistory} />
      {state.missions.length === 0 ? (
        <View style={styles.empty} testID="practice-missions-empty">
          <Text style={styles.emptyTitle}>{t('practice.missions.empty.title')}</Text>
          <Text style={styles.emptySubtitle}>{t('practice.missions.empty.body')}</Text>
        </View>
      ) : (
        <FlatList
          data={remainingMissions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MissionRow
              item={item}
              onPress={() => handleSelectMission(item.id)}
              recommendedReason={recommendationByMissionId.get(item.id)?.reason}
            />
          )}
          ListHeaderComponent={
            weeklyPlanMissions.length > 0 ? (
              <View style={styles.planSection} testID="practice-weekly-plan">
                <Text style={styles.planTitle}>{t('practice_plan_title')}</Text>
                <View style={styles.planList}>
                  {weeklyPlanStatus.totalCount > 0 ? (
                    <View style={styles.planBanner}>
                      <Text style={styles.planBannerText}>
                        {weeklyPlanStatus.isPlanCompleted
                          ? t('practice_plan_completed_banner')
                          : t('practice_plan_progress_banner', {
                              completed: weeklyPlanStatus.completedCount,
                              total: weeklyPlanStatus.totalCount,
                            })}
                      </Text>
                    </View>
                  ) : null}
                  {weeklyPlanMissions.map((mission) => (
                    <View key={mission.id} style={styles.planItem}>
                      <View style={styles.planBadge}>
                        <Text style={styles.planBadgeText}>{t('practice_plan_badge', { rank: mission.planRank })}</Text>
                      </View>
                      <MissionRow
                        item={mission}
                        completionLabel={
                          mission.isCompletedThisWeek
                            ? t('practice_plan_complete_label')
                            : t('practice_plan_incomplete_label')
                        }
                        completionLabelVariant={mission.isCompletedThisWeek ? 'complete' : 'incomplete'}
                        recommendedReason={recommendationByMissionId.get(mission.id)?.reason}
                        onPress={() => handleSelectMission(mission.id, mission.planRank)}
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>{t('practice.missions.title')}</Text>
              </View>
            ) : undefined
          }
          testID="practice-missions-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  insightsCard: {
    gap: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  insightsRow: {
    marginTop: 6,
    gap: 2,
  },
  insightsLabel: {
    fontWeight: '700',
    color: '#1F2937',
  },
  insightsPositive: {
    color: '#065F46',
    fontWeight: '600',
  },
  insightsNeutral: {
    color: '#6B7280',
    fontWeight: '500',
  },
  insightsEmpty: {
    color: '#4B5563',
    marginTop: 4,
  },
  historySection: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  historyEmpty: {
    color: '#4B5563',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    gap: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyLabel: {
    fontWeight: '700',
    color: '#111827',
  },
  historyCounts: {
    color: '#1F2937',
  },
  historyPositive: {
    color: '#065F46',
    fontWeight: '700',
  },
  historyNeutral: {
    color: '#6B7280',
    fontWeight: '600',
  },
  loading: {
    color: '#4B5563',
    marginTop: 8,
  },
  empty: {
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    color: '#4B5563',
  },
  list: {
    gap: 12,
    paddingTop: 8,
  },
  planSection: {
    gap: 12,
    paddingBottom: 8,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  planList: {
    gap: 12,
  },
  planBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ECFDF3',
  },
  planBannerText: {
    color: '#065F46',
    fontWeight: '700',
  },
  planItem: {
    gap: 8,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planBadgeText: {
    color: '#0C4A6E',
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  item: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontWeight: '700',
    color: '#312E81',
    fontSize: 12,
  },
  recommendedBadge: {
    backgroundColor: '#ECFDF3',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recommendedBadgeText: {
    fontWeight: '700',
    color: '#065F46',
    fontSize: 12,
  },
  recommendedReason: {
    color: '#065F46',
    fontWeight: '600',
  },
  meta: {
    color: '#374151',
  },
  completeLabel: {
    color: '#065F46',
    fontWeight: '700',
  },
  incompleteLabel: {
    color: '#6B7280',
  },
  streak: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
