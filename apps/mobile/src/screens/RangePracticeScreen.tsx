import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import { loadPracticeMissionHistory, PRACTICE_MISSION_WINDOW_DAYS } from '@app/storage/practiceMissionHistory';
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';
import { fetchPlayerBag, type PlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import { buildBagReadinessOverview, type BagReadinessOverview } from '@shared/caddie/bagReadiness';
import { buildBagPracticeRecommendation, type BagPracticeRecommendation } from '@shared/caddie/bagPracticeRecommendations';

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

export default function RangePracticeScreen({ navigation }: Props): JSX.Element {
  const [trainingGoal, setTrainingGoal] = useState<string | null>(null);
  const [bag, setBag] = useState<PlayerBag | null>(null);
  const [bagOverview, setBagOverview] = useState<BagReadinessOverview | null>(null);
  const [practiceRecommendation, setPracticeRecommendation] = useState<BagPracticeRecommendation | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeMissionHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadGoal = async () => {
      const goal = await loadCurrentTrainingGoal();
      if (!cancelled) {
        setTrainingGoal(goal?.text ?? null);
      }
    };

    const unsubscribe = typeof (navigation as any).addListener === 'function'
      ? (navigation as any).addListener('focus', loadGoal)
      : () => {};
    loadGoal();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const history = await loadPracticeMissionHistory();
        if (!cancelled) {
          setPracticeHistory(history);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[range] Failed to load practice history', err);
        }
      }
    };

    loadHistory().catch((err) => console.warn('[range] practice history load crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [bagPayload, bagStatsPayload] = await Promise.all([
          fetchPlayerBag(),
          fetchBagStats(),
        ]);

        if (cancelled) return;

        setBag(bagPayload);

        const overview = buildBagReadinessOverview(bagPayload, bagStatsPayload ?? {});
        setBagOverview(overview);
        setPracticeRecommendation(
          buildBagPracticeRecommendation(overview, overview.suggestions, practiceHistory),
        );
      } catch (err) {
        if (!cancelled) {
          console.warn('[range] Unable to load bag readiness for practice', err);
          setBag(null);
          setBagOverview(null);
          setPracticeRecommendation(null);
        }
      }
    };

    const unsubscribe = typeof (navigation as any).addListener === 'function'
      ? (navigation as any).addListener('focus', load)
      : () => {};

    load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (!bagOverview) return;
    setPracticeRecommendation(
      buildBagPracticeRecommendation(bagOverview, bagOverview.suggestions, practiceHistory),
    );
  }, [bagOverview, practiceHistory]);

  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    bag?.clubs.forEach((club) => {
      labels[club.clubId] = club.label;
    });
    return labels;
  }, [bag?.clubs]);

  const recommendationCopy = useMemo(() => {
    if (!practiceRecommendation) return null;

    const [firstClubId, secondClubId] = practiceRecommendation.targetClubs;
    const lower = firstClubId ? clubLabels[firstClubId] ?? firstClubId : undefined;
    const upper = secondClubId ? clubLabels[secondClubId] ?? secondClubId : undefined;
    const club = lower;

    return {
      title: t(practiceRecommendation.titleKey, { lower, upper, club }),
      description: t(practiceRecommendation.descriptionKey, { lower, upper, club }),
    };
  }, [clubLabels, practiceRecommendation]);

  const recommendationStatusLabel = useMemo(() => {
    if (!practiceRecommendation) return null;

    if (practiceRecommendation.status === 'new') return t('bag.practice.status.new');
    if (practiceRecommendation.status === 'due') return t('bag.practice.status.due');
    return t('bag.practice.status.fresh');
  }, [practiceRecommendation]);

  const recommendationProgress = useMemo(() => {
    if (!practiceRecommendation) return null;
    const map = buildMissionProgressById(practiceHistory, [practiceRecommendation.id], {
      windowDays: PRACTICE_MISSION_WINDOW_DAYS,
    });
    return map[practiceRecommendation.id];
  }, [practiceHistory, practiceRecommendation]);

  const recommendationProgressLabel = useMemo(() => {
    if (!recommendationProgress) return null;
    const parts = [
      recommendationProgress.completedSessions > 0
        ? t('bag.practice.progress.recent', {
            count: recommendationProgress.completedSessions,
            days: PRACTICE_MISSION_WINDOW_DAYS,
          })
        : t('bag.practice.progress.empty'),
    ];

    if (recommendationProgress.inStreak) {
      parts.push(t('bag.practice.progress.streak'));
    }

    return parts.join(' • ');
  }, [recommendationProgress]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.navigate('RangeTrainingGoal')}
        style={styles.trainingGoalCard}
        testID="training-goal-card"
      >
        {trainingGoal ? (
          <>
            <Text style={styles.cardOverline}>{t('range.trainingGoal.current_title')}</Text>
            <Text style={styles.trainingGoalText} numberOfLines={2}>
              {trainingGoal}
            </Text>
            <Text style={styles.trainingGoalLink}>{t('range.trainingGoal.change_button')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.trainingGoalTitle}>{t('range.trainingGoal.no_goal_title')}</Text>
            <Text style={styles.trainingGoalSubtitle}>{t('range.trainingGoal.no_goal_subtitle')}</Text>
            <Text style={styles.trainingGoalLink}>{t('range.trainingGoal.set_button')}</Text>
          </>
        )}
      </TouchableOpacity>

      {practiceRecommendation && recommendationCopy ? (
        <View style={styles.card} testID="range-recommendation-card">
          <Text style={styles.cardOverline}>{t('bag.practice.recommendedTitle')}</Text>
          <Text style={styles.cardTitle}>{recommendationCopy.title}</Text>
          {recommendationStatusLabel ? (
            <Text style={styles.statusChip} testID="range-recommendation-status">
              {recommendationStatusLabel}
            </Text>
          ) : null}
          <Text style={styles.cardSubtitle}>{recommendationCopy.description}</Text>
          {recommendationProgressLabel ? (
            <Text style={styles.cardHelper} testID="range-recommendation-progress">
              {recommendationProgressLabel}
            </Text>
          ) : null}
          <TouchableOpacity
            accessibilityLabel={t('bag.practice.startCta')}
            onPress={() =>
              navigation.navigate('RangeQuickPracticeStart', {
                practiceRecommendation,
                entrySource: 'range_home',
              })
            }
            testID="range-recommendation-cta"
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('bag.practice.startCta')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.title}>Range & Training</Text>
      <Text style={styles.subtitle}>Värm upp, följ din träning och lås upp fler insikter.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick practice</Text>
        <Text style={styles.cardSubtitle}>Hit a bucket with feedback and shot tracking.</Text>
        <TouchableOpacity
          accessibilityLabel="Start quick practice"
          onPress={() => navigation.navigate('RangeQuickPracticeStart', { entrySource: 'range_home' })}
          testID="range-quick-practice-cta"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Starta</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.hub.history_cta_title')}</Text>
        <Text style={styles.cardSubtitle}>{t('range.hub.history_cta_subtitle')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RangeHistory')} testID="range-history-cta">
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('range.hub.history_cta_title')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.progress.card_title')}</Text>
        <Text style={styles.cardSubtitle}>{t('range.progress.card_subtitle')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RangeProgress')} testID="range-progress-cta">
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('range.progress.card_title')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.missions.card_title')}</Text>
        <Text style={styles.cardSubtitle}>{t('range.missions.card_subtitle')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RangeMissions')} testID="range-missions-cta">
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('range.missions.card_cta')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 8,
  },
  trainingGoalCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  cardOverline: {
    textTransform: 'uppercase',
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
  },
  trainingGoalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  trainingGoalSubtitle: {
    color: '#4B5563',
  },
  trainingGoalText: {
    color: '#111827',
    fontSize: 16,
  },
  trainingGoalLink: {
    color: '#2563EB',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#374151',
  },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  cardHelper: {
    color: '#6B7280',
  },
  statusChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF3',
    color: '#047857',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '700',
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
});
