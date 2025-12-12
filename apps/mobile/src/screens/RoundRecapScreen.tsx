import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createRoundShareLink } from '@app/api/shareClient';
import { fetchRoundRecap, type RoundRecap } from '@app/api/roundClient';
import { fetchRoundStrokesGained, type RoundStrokesGained } from '@app/api/strokesGainedClient';
import { fetchDemoRoundRecap } from '@app/demo/demoService';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { fetchPlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import {
  buildBagReadinessOverview,
  buildBagReadinessRecapInfo,
  type BagReadinessRecapInfo,
} from '@shared/caddie/bagReadiness';
import type { PlayerBag } from '@shared/caddie/playerBag';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import { formatBagSuggestion } from '@app/caddie/formatBagSuggestion';
import { loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import type { PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import {
  getTopPracticeRecommendationForRecap,
  type BagPracticeRecommendation,
} from '@shared/caddie/bagPracticeRecommendations';
import { buildPracticeReadinessSummary } from '@shared/practice/practiceReadiness';
import { emitPracticeReadinessViewed } from '@shared/practice/practiceReadinessAnalytics';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundRecap'>;

const CATEGORY_ORDER: Array<keyof RoundRecap['categories']> = [
  'driving',
  'approach',
  'short_game',
  'putting',
];

const SG_LIGHT_ORDER: Array<'tee' | 'approach' | 'short_game' | 'putting'> = [
  'tee',
  'approach',
  'short_game',
  'putting',
];

function formatCategoryValue(key: keyof RoundRecap['categories'], value: number | null | undefined): string {
  if (value == null) return t('round.recap.missing_category');
  if (key === 'driving' || key === 'approach') {
    return `${Math.round(value * 100)}%`;
  }
  return `${value.toFixed(1)}`;
}

function formatSgValue(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export default function RoundRecapScreen({ route, navigation }: Props): JSX.Element {
  const { roundId, isDemo } = route.params ?? { roundId: '' };
  const [recap, setRecap] = useState<RoundRecap | null>(null);
  const [strokesGained, setStrokesGained] = useState<RoundStrokesGained | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sgError, setSgError] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [bag, setBag] = useState<PlayerBag | null>(null);
  const [bagStats, setBagStats] = useState<BagClubStatsMap | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeMissionHistoryEntry[]>([]);
  const [weeklyGoalSettings, setWeeklyGoalSettings] = useState(getDefaultWeeklyPracticeGoalSettings());
  const [loadingPractice, setLoadingPractice] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadDemo = async () => {
      const result = await fetchDemoRoundRecap();
      if (cancelled) return;
      setRecap(result.recap);
      setStrokesGained(result.strokesGained ?? null);
      setSgError(result.strokesGained ? null : t('strokesGained.unavailable'));
      setLoading(false);
    };

    const loadReal = () =>
      Promise.allSettled([fetchRoundRecap(roundId), fetchRoundStrokesGained(roundId)])
        .then(([recapResult, sgResult]) => {
          if (cancelled) return;
          if (recapResult.status === 'fulfilled') {
            setRecap(recapResult.value);
          } else {
            setError(t('round.recap.error'));
          }

          if (sgResult.status === 'fulfilled') {
            setStrokesGained(sgResult.value);
            setSgError(null);
          } else {
            setStrokesGained(null);
            setSgError(t('strokesGained.unavailable'));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    if (isDemo) {
      loadDemo().catch(() => {
        if (!cancelled) {
          setError(t('round.recap.error'));
          setLoading(false);
        }
      });
    } else {
      loadReal();
    }

    return () => {
      cancelled = true;
    };
  }, [isDemo, roundId]);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;

    Promise.allSettled([fetchPlayerBag(), fetchBagStats()])
      .then(([bagResult, statsResult]) => {
        if (cancelled) return;
        setBag(bagResult.status === 'fulfilled' ? bagResult.value : null);
        setBagStats(statsResult.status === 'fulfilled' ? statsResult.value : null);
      })
      .catch(() => {
        if (!cancelled) {
          setBag(null);
          setBagStats(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      setLoadingPractice(false);
      return;
    }
    let cancelled = false;
    setLoadingPractice(true);

    Promise.all([
      loadPracticeMissionHistory().catch(() => []),
      loadWeeklyPracticeGoalSettings().catch(() => getDefaultWeeklyPracticeGoalSettings()),
    ])
      .then(([history, settings]) => {
        if (!cancelled) {
          setPracticeHistory(history ?? []);
          setWeeklyGoalSettings(settings ?? getDefaultWeeklyPracticeGoalSettings());
        }
      })
      .catch((err) => {
        console.warn('[round] Failed to load practice history for recap', err);
        if (!cancelled) {
          setPracticeHistory([]);
          setWeeklyGoalSettings(getDefaultWeeklyPracticeGoalSettings());
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPractice(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const scoreLine = useMemo(() => {
    if (!recap) return '';
    const toPar = recap.toPar ?? t('round.recap.to_par_even');
    const score = recap.score ?? '—';
    return `${score} (${toPar})`;
  }, [recap]);

  const courseName = recap?.courseName || t('round.history.unnamed_course');
  const dateLabel = useMemo(() => {
    if (!recap?.date) return '';
    const parsed = new Date(recap.date);
    if (Number.isNaN(parsed.getTime())) return recap.date;
    return parsed.toLocaleDateString();
  }, [recap?.date]);

  const bagReadinessOverview = useMemo(() => {
    if (!bag || !bagStats) return null;
    try {
      return buildBagReadinessOverview(bag, bagStats);
    } catch (err) {
      console.warn('[round] Failed to compute recap bag readiness', err);
      return null;
    }
  }, [bag, bagStats]);

  const bagReadinessRecap = useMemo<BagReadinessRecapInfo | null>(() => {
    return buildBagReadinessRecapInfo(bag, bagStats);
  }, [bag, bagStats]);

  const practiceReadiness = useMemo(
    () =>
      buildPracticeReadinessSummary({
        history: practiceHistory,
        goalSettings: weeklyGoalSettings,
        now: new Date(),
      }),
    [practiceHistory, weeklyGoalSettings],
  );

  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    bag?.clubs?.forEach((club) => {
      labels[club.clubId] = club.label;
    });
    return labels;
  }, [bag?.clubs]);

  const readinessSummary = useMemo(() => {
    if (!bagReadinessRecap) return null;
    return t(`bag.readinessRecap.summary.${bagReadinessRecap.summary}`);
  }, [bagReadinessRecap, t]);

  const readinessSuggestion = useMemo(() => {
    if (!bagReadinessRecap?.topSuggestionId || !bagReadinessOverview?.suggestions?.length) return null;
    const suggestion =
      bagReadinessOverview.suggestions.find((item) => item.id === bagReadinessRecap.topSuggestionId) ??
      bagReadinessOverview.suggestions[0];
    return suggestion ? formatBagSuggestion(suggestion, clubLabels) : null;
  }, [bagReadinessOverview?.suggestions, bagReadinessRecap?.topSuggestionId, clubLabels]);

  const practiceReadinessLine = useMemo(
    () =>
      t('bag.readinessRecap.practiceLine', {
        sessions: practiceReadiness.sessionsCompleted,
        shots: practiceReadiness.shotsCompleted,
      }),
    [practiceReadiness.sessionsCompleted, practiceReadiness.shotsCompleted, t],
  );

  const practiceGoalLine = useMemo(() => {
    if (practiceReadiness.goalTarget == null) return null;
    if (practiceReadiness.goalReached) return t('bag.readinessRecap.practiceGoalReached');
    return t('bag.readinessRecap.practiceGoalLine', {
      progress: practiceReadiness.goalProgress,
      target: practiceReadiness.goalTarget,
    });
  }, [practiceReadiness.goalProgress, practiceReadiness.goalReached, practiceReadiness.goalTarget, t]);

  const topPracticeRecommendation = useMemo<BagPracticeRecommendation | null>(() => {
    if (!bagReadinessOverview) return null;
    try {
      return getTopPracticeRecommendationForRecap({
        overview: bagReadinessOverview,
        history: practiceHistory,
        suggestions: bagReadinessOverview.suggestions,
      });
    } catch (err) {
      console.warn('[round] Failed to build recap practice recommendation', err);
      return null;
    }
  }, [bagReadinessOverview, practiceHistory]);

  const topPracticeCopy = useMemo(() => {
    if (!topPracticeRecommendation) return null;
    const [firstClubId, secondClubId] = topPracticeRecommendation.targetClubs;
    const lower = firstClubId ? clubLabels[firstClubId] ?? firstClubId : undefined;
    const upper = secondClubId ? clubLabels[secondClubId] ?? secondClubId : undefined;
    const club = lower;

    return {
      title: t(topPracticeRecommendation.titleKey, { lower, upper, club }),
      description: t(topPracticeRecommendation.descriptionKey, { lower, upper, club }),
    };
  }, [clubLabels, t, topPracticeRecommendation]);

  const topPracticeStatusLabel = useMemo(() => {
    if (!topPracticeRecommendation) return null;

    if (topPracticeRecommendation.status === 'new') return t('bag.practice.status.new');
    if (topPracticeRecommendation.status === 'due') return t('bag.practice.status.due');
    return t('bag.practice.status.fresh');
  }, [topPracticeRecommendation, t]);

  useEffect(() => {
    if (loadingPractice || !bagReadinessRecap) return;
    emitPracticeReadinessViewed(
      { emit: safeEmit },
      { surface: 'bag_recap', platform: 'mobile', roundId, summary: practiceReadiness },
    );
  }, [bagReadinessRecap, loadingPractice, practiceReadiness, roundId]);

  const handleStartNextPractice = useCallback(() => {
    if (!topPracticeRecommendation) {
      navigation.navigate('RangePractice');
      return;
    }

    safeEmit('practice_mission_start', {
      missionId: topPracticeRecommendation.id,
      sourceSurface: 'round_recap',
    });

    if (!topPracticeRecommendation.targetClubs?.length) {
      console.warn('[round] Missing target clubs for recap recommendation');
      navigation.navigate('RangePractice');
      return;
    }

    navigation.navigate('RangeQuickPracticeStart', {
      practiceRecommendation: topPracticeRecommendation,
      entrySource: 'recap',
    });
  }, [navigation, topPracticeRecommendation]);

  const strokesInsight = useMemo(() => {
    if (!strokesGained) return null;
    const categories = Object.values(strokesGained.categories ?? {});
    if (categories.length === 0) return null;

    const best = categories.reduce((acc, curr) => (curr.value > acc.value ? curr : acc), categories[0]);
    const worst = categories.reduce((acc, curr) => (curr.value < acc.value ? curr : acc), categories[0]);

    if (worst.value < -0.2) {
      return t('strokesGained.roundLeak', { category: worst.label });
    }
    if (best.value > 0.8) {
      return t('strokesGained.roundCarry', { category: best.label });
    }
    return t('strokesGained.roundEven');
  }, [strokesGained]);

  const bestCategoryLabel = useMemo(() => {
    if (!strokesGained) return null;
    const categories = Object.values(strokesGained.categories ?? {});
    if (categories.length === 0) return null;
    const best = categories.reduce((acc, curr) => (curr.value > acc.value ? curr : acc), categories[0]);
    return best.label ?? null;
  }, [strokesGained]);

  const sgLightHeadline = useMemo(() => {
    const sgLight = recap?.strokesGainedLight;
    if (!sgLight || !sgLight.byCategory?.length) return null;

    const confident = sgLight.byCategory.filter((entry) => entry.confidence >= 0.3);
    if (!confident.length) return 'Not enough data yet';

    const focus = confident.reduce((acc, curr) =>
      Math.abs(curr.delta) > Math.abs(acc.delta) ? curr : acc,
    );
    const labelMap: Record<string, string> = {
      tee: 'Tee',
      approach: 'Approach',
      short_game: 'Short game',
      putting: 'Putting',
    };
    const label = labelMap[focus.category] ?? focus.category;
    const deltaLabel = formatSgValue(focus.delta);
    return focus.delta >= 0 ? `You gained ${deltaLabel} on ${label}` : `You lost ${deltaLabel} on ${label}`;
  }, [recap?.strokesGainedLight]);

  const sgLightFocusCategory = recap?.strokesGainedLight?.focusCategory ?? null;

  const sgLightFocusLabel = useMemo(() => {
    if (!sgLightFocusCategory) return null;
    const map: Record<string, string> = {
      tee: 'Off the tee',
      approach: 'Approach shots',
      short_game: 'Short game',
      putting: 'Putting',
    };
    return map[sgLightFocusCategory] ?? sgLightFocusCategory;
  }, [sgLightFocusCategory]);

  const sgLightOpportunityLine = useMemo(() => {
    if (!sgLightFocusLabel) return null;
    return `Biggest opportunity: ${sgLightFocusLabel}`;
  }, [sgLightFocusLabel]);

  const sgLightPracticeCtaLabel = useMemo(() => {
    if (!sgLightFocusLabel) return null;
    const lower = sgLightFocusLabel.charAt(0).toLowerCase() + sgLightFocusLabel.slice(1);
    return `Practice ${lower}`;
  }, [sgLightFocusLabel]);

  const handlePracticeFromSgLight = useCallback(() => {
    if (!sgLightFocusCategory) return;
    navigation.navigate('PracticeMissions', {
      practiceRecommendationSource: 'round_recap_sg_light',
      strokesGainedLightFocusCategory: sgLightFocusCategory,
    });
  }, [navigation, sgLightFocusCategory]);

  const handleShare = useCallback(async () => {
    if (isDemo || !recap) return;
    const categories = recap.categories || {};
    const drivingGrade = categories.driving?.grade ?? '—';
    const approachGrade = categories.approach?.grade ?? '—';
    const shortGameGrade = categories.short_game?.grade ?? '—';
    const puttingGrade = categories.putting?.grade ?? '—';
    const firstHint = recap.focusHints[0] ?? t('round.recap.share_focus_fallback');
    const toPar = recap.toPar ?? t('round.recap.to_par_even');
    const score = recap.score ?? '—';

    const fallbackMessage = t('round.recap.share_template', {
      course: courseName,
      score,
      toPar,
      driving: drivingGrade,
      approach: approachGrade,
      shortGame: shortGameGrade,
      putting: puttingGrade,
      focus: firstHint,
    });

    setShareLoading(true);

    try {
      const link = await createRoundShareLink(roundId);
      const message = t('round.recap.share_link_template', {
        course: courseName,
        score,
        toPar,
        bestCategory: bestCategoryLabel ?? t('round.recap.share_focus_fallback'),
        url: link.url,
      });
      await Share.share({ message });
    } catch (err) {
      console.warn('[round] Failed to share recap link', err);
      try {
        await Share.share({ message: fallbackMessage });
      } catch (shareErr) {
        console.warn('[round] Failed to share fallback recap', shareErr);
        Alert.alert(t('round.recap.share_error_title'), t('round.recap.share_error_body'));
      }
    } finally {
      setShareLoading(false);
    }
  }, [bestCategoryLabel, courseName, isDemo, recap, roundId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('round.recap.loading')}</Text>
      </View>
    );
  }

  if (error || !recap) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{t('round.recap.title')}</Text>
        <Text style={styles.muted}>{error ?? t('round.recap.error')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{courseName}</Text>
        <Text style={styles.subtitle}>{dateLabel}</Text>
        <Text style={styles.score}>{scoreLine}</Text>
        <Text style={styles.helper}>{t('round.recap.holes', { holes: recap.holesPlayed })}</Text>
      </View>

      {bagReadinessRecap ? (
        // TODO: track recap bag readiness impressions
        <View style={styles.card} testID="recap-bag-readiness">
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('bag.readinessTitle')}</Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                navigation.navigate('MyBag');
                // TODO: track bag readiness recap navigation
              }}
              testID="recap-open-bag"
            >
              <Text style={styles.secondaryButtonText}>{t('bag.readinessRecap.tuneCta')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.readinessRow}>
            <Text style={styles.readinessScore}>{bagReadinessRecap.score}/100</Text>
            <Text style={styles.readinessGrade}>
              {t(`bag.readinessGrade.${bagReadinessRecap.grade}`)}
            </Text>
          </View>
          {readinessSummary ? <Text style={styles.bodyText}>{readinessSummary}</Text> : null}
          {readinessSuggestion ? (
            <Text style={styles.suggestionLine} numberOfLines={2} testID="recap-bag-suggestion">
              {t('bag.readinessTileSuggestionPrefix')} {readinessSuggestion}
            </Text>
          ) : null}
          {!loadingPractice ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.bodyText}>{practiceReadinessLine}</Text>
              {practiceGoalLine ? <Text style={styles.meta}>{practiceGoalLine}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {topPracticeRecommendation && topPracticeCopy ? (
        <View style={styles.card} testID="recap-practice-recommendation">
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('round.recap.nextPracticeTitle')}</Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleStartNextPractice}
              testID="recap-start-next-practice"
            >
              <Text style={styles.secondaryButtonText}>{t('round.recap.nextPracticeCta')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardHelper}>{t('round.recap.nextPracticeHelper')}</Text>
          <View style={styles.practiceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.practiceTitle}>{topPracticeCopy.title}</Text>
              <Text style={styles.bodyText}>{topPracticeCopy.description}</Text>
            </View>
            {topPracticeStatusLabel ? (
              <Text style={styles.statusChip} testID="recap-practice-status">
                {topPracticeStatusLabel}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{t('round.recap.categories_title')}</Text>
          {!isDemo ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleShare}
              disabled={shareLoading}
              testID="share-round"
            >
              {shareLoading ? (
                <ActivityIndicator color="#00c853" />
              ) : (
                <Text style={styles.secondaryButtonText}>{t('round.recap.share_cta')}</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.grid}>
          {CATEGORY_ORDER.map((key) => {
            const category = recap.categories?.[key];
            return (
              <View key={key} style={styles.tile} testID={`recap-${key}`}>
                <Text style={styles.tileLabel}>{category?.label ?? key}</Text>
                <Text style={styles.tileGrade}>{category?.grade ?? '—'}</Text>
                <Text style={styles.tileValue}>{formatCategoryValue(key, category?.value)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('strokesGained.roundSectionTitle')}</Text>
        {recap.strokesGainedLight ? (
          <View style={styles.sgLightCard} testID="sg-light-card">
            <View style={styles.sgHeaderRow}>
              <Text style={styles.sgLabel}>Strokes Gained (Light)</Text>
              <Text style={styles.sgValue}>{formatSgValue(recap.strokesGainedLight.totalDelta)}</Text>
            </View>
            {sgLightHeadline ? <Text style={styles.muted}>{sgLightHeadline}</Text> : null}
            {sgLightOpportunityLine ? (
              <Text style={styles.bodyText} testID="sg-light-opportunity">
                {sgLightOpportunityLine}
              </Text>
            ) : null}
            <View style={styles.grid}>
              {SG_LIGHT_ORDER.map((key) => {
                const entry = recap.strokesGainedLight?.byCategory?.find((c) => c.category === key);
                const confident = (entry?.confidence ?? 0) >= 0.3;
                return (
                  <View key={`sg-light-${key}`} style={styles.tile} testID={`recap-sg-light-${key}`}>
                    <Text style={styles.tileLabel}>{key.replace('_', ' ')}</Text>
                    {entry ? (
                      <>
                        <Text
                          style={[
                            styles.tileValue,
                            (entry.delta ?? 0) >= 0 ? styles.sgPositive : styles.sgNegative,
                          ]}
                        >
                          {confident ? formatSgValue(entry.delta ?? 0) : '—'}
                        </Text>
                        <Text style={styles.muted}>
                          {confident
                            ? `${entry.shots} shots • ${(entry.confidence * 100).toFixed(0)}% confidence`
                            : 'Not enough data yet'}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.muted}>No data</Text>
                    )}
                  </View>
                );
              })}
            </View>
            {sgLightPracticeCtaLabel ? (
              <TouchableOpacity
                style={styles.primaryCta}
                onPress={handlePracticeFromSgLight}
                testID="sg-light-practice-cta"
              >
                <Text style={styles.primaryCtaText}>{sgLightPracticeCtaLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {strokesGained ? (
          <>
            <View style={styles.sgHeaderRow}>
              <Text style={styles.sgLabel}>{t('strokesGained.totalLabel')}</Text>
              <Text
                style={[
                  styles.sgValue,
                  (strokesGained.total ?? 0) >= 0 ? styles.sgPositive : styles.sgNegative,
                ]}
              >
                {formatSgValue(strokesGained.total)}
              </Text>
            </View>
            <View style={styles.grid}>
              {CATEGORY_ORDER.map((key) => {
                const category = strokesGained.categories?.[key];
                return (
                  <View key={`sg-${key}`} style={styles.tile} testID={`recap-sg-${key}`}>
                    <Text style={styles.tileLabel}>
                      {category?.label ?? t(`weeklySummary.categories.${key}`)}
                    </Text>
                    <Text style={styles.tileGrade}>{category?.grade ?? '—'}</Text>
                    <Text
                      style={[
                        styles.tileValue,
                        (category?.value ?? 0) >= 0 ? styles.sgPositive : styles.sgNegative,
                      ]}
                    >
                      {formatSgValue(category?.value ?? 0)}
                    </Text>
                    <Text style={styles.muted}>{category?.comment ?? ''}</Text>
                  </View>
                );
              })}
            </View>
            {strokesInsight ? <Text style={styles.muted}>{strokesInsight}</Text> : null}
          </>
        ) : (
          <Text style={styles.muted}>{sgError ?? t('strokesGained.unavailable')}</Text>
        )}
      </View>

      {recap.caddieSummary ? (
        <View style={styles.card} testID="caddie-summary">
          <Text style={styles.cardTitle}>{t('round.recap.caddie_title')}</Text>
          <Text style={styles.bodyText}>
            {t('round.recap.caddie_follow_rate', {
              followed: recap.caddieSummary.followedDecisions,
              total: recap.caddieSummary.totalDecisions,
              rate:
                recap.caddieSummary.followRate != null
                  ? ` (${Math.round(recap.caddieSummary.followRate * 100)}%)`
                  : '',
            })}
          </Text>
          {recap.caddieSummary.notes.map((note, idx) => (
            <Text key={idx} style={styles.bullet}>{`• ${note}`}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('round.recap.focus_title')}</Text>
        {recap.focusHints.length === 0 ? (
          <Text style={styles.muted}>{t('round.recap.focus_empty')}</Text>
        ) : (
          recap.focusHints.map((hint) => (
            <Text key={hint} style={styles.bullet}>{`• ${hint}`}</Text>
          ))
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryCta}
        onPress={() =>
          navigation.navigate('CoachReport', {
            roundId,
            courseName,
            date: recap?.date,
            isDemo,
          })
        }
        testID="open-coach-report"
      >
        <Text style={styles.primaryCtaText}>{t('coach_report_cta_from_recap')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#6b7280' },
  score: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  helper: { color: '#6b7280' },
  cardHelper: { color: '#6b7280', fontSize: 14 },
  muted: { color: '#6b7280', marginTop: 4, textAlign: 'center' },
  meta: { color: '#6b7280' },
  bodyText: { color: '#111827' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  sgLightCard: { gap: 8 },
  practiceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  practiceTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusChip: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    color: '#111827',
    fontWeight: '700',
  },
  readinessRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  readinessScore: { fontSize: 24, fontWeight: '700', color: '#111827' },
  readinessGrade: { color: '#6b7280', fontWeight: '600' },
  suggestionLine: { color: '#111827' },
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
  tileGrade: { fontSize: 24, fontWeight: '700' },
  tileValue: { color: '#374151' },
  sgHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sgLabel: { color: '#111827', fontWeight: '600' },
  sgValue: { fontSize: 20, fontWeight: '700' },
  sgPositive: { color: '#047857' },
  sgNegative: { color: '#b91c1c' },
  bullet: { color: '#111827' },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: { color: '#111827', fontWeight: '700' },
  primaryCta: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryCtaText: { color: '#fff', fontWeight: '700' },
});
