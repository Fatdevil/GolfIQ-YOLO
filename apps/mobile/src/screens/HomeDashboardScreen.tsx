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

import { fetchPlayerBag, type PlayerBag } from '@app/api/bagClient';
import {
  fetchCurrentRound,
  fetchLatestCompletedRound,
  type RoundInfo,
  type RoundSummaryWithRoundInfo,
} from '@app/api/roundClient';
import { fetchPracticePlan, type PracticePlan } from '@app/api/practiceClient';
import { fetchPlayerProfile, type PlayerProfile } from '@app/api/player';
import { fetchWeeklySummary, type WeeklySummary } from '@app/api/weeklySummary';
import { createWeeklyShareLink } from '@app/api/shareClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

const CALIBRATION_SAMPLE_THRESHOLD = 5;

type Props = NativeStackScreenProps<RootStackParamList, 'HomeDashboard'>;

type DashboardState = {
  loading: boolean;
  profile: PlayerProfile | null;
  currentRound: RoundInfo | null;
  latestRound: RoundSummaryWithRoundInfo | null;
  weeklySummary: WeeklySummary | null;
  practicePlan: PracticePlan | null;
  bag: PlayerBag | null;
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatToPar(toPar?: number | null): string | null {
  if (toPar === null || toPar === undefined) return null;
  if (toPar === 0) return 'E';
  return `${toPar > 0 ? '+' : ''}${toPar}`;
}

function deriveGreeting(profile: PlayerProfile | null): string {
  const raw = profile?.name?.trim();
  if (!raw) return t('home_dashboard_title');
  const [first] = raw.split(' ');
  return t('home_dashboard_greeting', { name: first || raw });
}

function summarizeBag(bag: PlayerBag | null): { calibrated: number; needsMore: number } {
  if (!bag) return { calibrated: 0, needsMore: 0 };
  const calibrated = bag.clubs.filter((club) => club.sampleCount >= CALIBRATION_SAMPLE_THRESHOLD).length;
  const needsMore = Math.max(bag.clubs.length - calibrated, 0);
  return { calibrated, needsMore };
}

export default function HomeDashboardScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    profile: null,
    currentRound: null,
    latestRound: null,
    weeklySummary: null,
    practicePlan: null,
    bag: null,
  });
  const [sharingWeekly, setSharingWeekly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [profileRes, currentRoundRes, latestRoundRes, weeklyRes, practiceRes, bagRes] =
        await Promise.allSettled([
          fetchPlayerProfile(),
          fetchCurrentRound(),
          fetchLatestCompletedRound(),
          fetchWeeklySummary(),
          fetchPracticePlan({ maxMinutes: 30 }),
          fetchPlayerBag(),
        ]);

      if (cancelled) return;
      const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const currentRound = currentRoundRes.status === 'fulfilled' ? currentRoundRes.value : null;
      const latestRound = latestRoundRes.status === 'fulfilled' ? latestRoundRes.value : null;
      const weeklySummary = weeklyRes.status === 'fulfilled' ? weeklyRes.value : null;
      const practicePlan = practiceRes.status === 'fulfilled' ? practiceRes.value : null;
      const bag = bagRes.status === 'fulfilled' ? bagRes.value : null;

      if (profileRes.status === 'rejected') console.warn('Home dashboard profile load failed', profileRes.reason);
      if (currentRoundRes.status === 'rejected')
        console.warn('Home dashboard current round load failed', currentRoundRes.reason);
      if (latestRoundRes.status === 'rejected')
        console.warn('Home dashboard latest round load failed', latestRoundRes.reason);
      if (weeklyRes.status === 'rejected') console.warn('Home dashboard weekly load failed', weeklyRes.reason);
      if (practiceRes.status === 'rejected') console.warn('Home dashboard practice load failed', practiceRes.reason);
      if (bagRes.status === 'rejected') console.warn('Home dashboard bag load failed', bagRes.reason);

      setState({
        loading: false,
        profile,
        currentRound,
        latestRound,
        weeklySummary,
        practicePlan,
        bag,
      });
    };

    load().catch((err) => console.warn('Home dashboard load crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, profile, currentRound, latestRound, weeklySummary, practicePlan, bag } = state;

  const latestRoundDisplay = useMemo(() => {
    if (!latestRound) return null;
    const ended = latestRound.endedAt ?? latestRound.startedAt;
    const date = formatDate(ended);
    const score =
      formatToPar(latestRound.totalToPar ?? null) ??
      (typeof latestRound.totalStrokes === 'number' ? `${latestRound.totalStrokes}` : null);
    return {
      course: latestRound.courseId || t('home_dashboard_last_round_unknown_course'),
      date,
      score,
      roundId: latestRound.roundId,
    };
  }, [latestRound]);

  const practiceHeadline = useMemo(() => {
    if (!practicePlan?.drills?.length) return t('home_dashboard_practice_generic');
    const drills = practicePlan.drills.slice(0, 3).map((d) => d.name).join(' · ');
    return drills;
  }, [practicePlan]);

  const bagSummary = useMemo(() => summarizeBag(bag), [bag]);

  const weeklyTopCategory = useMemo(() => {
    const categories = weeklySummary?.categories ?? {};
    const order: Array<keyof typeof categories> = ['driving', 'approach', 'short_game', 'putting'];
    for (const key of order) {
      const category = categories[key];
      if (category?.grade || category?.note) {
        return t(`weeklySummary.categories.${key}` as const);
      }
    }
    return t('weeklySummary.categories.driving');
  }, [weeklySummary?.categories]);

  const handleShareWeekly = useCallback(async () => {
    if (!weeklySummary) return;
    const rounds = weeklySummary.period.roundCount ?? 0;
    const avgScoreRaw = weeklySummary.coreStats.avgScore;
    const avgScore =
      avgScoreRaw == null ? '—' : avgScoreRaw.toFixed(Number.isInteger(avgScoreRaw) ? 0 : 1);
    const fallbackMessage = t('weeklySummary.shareFallback', {
      rounds,
      avgScore,
      topCategory: weeklyTopCategory,
    });

    setSharingWeekly(true);

    try {
      const link = await createWeeklyShareLink();
      const message = t('weeklySummary.shareTemplate', {
        rounds,
        avgScore,
        topCategory: weeklyTopCategory,
        url: link.url,
      });
      await Share.share({ message });
    } catch (err) {
      console.warn('[home] Failed to share weekly summary', err);
      try {
        await Share.share({ message: fallbackMessage });
      } catch (shareErr) {
        console.warn('[home] Failed to share weekly fallback', shareErr);
        Alert.alert(t('weeklySummary.shareErrorTitle'), t('weeklySummary.shareErrorBody'));
      }
    } finally {
      setSharingWeekly(false);
    }
  }, [weeklySummary, weeklyTopCategory]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>{t('home_dashboard_loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} testID="home-dashboard">
      <View style={styles.header}>
        <Text style={styles.title} testID="home-dashboard-greeting">
          {deriveGreeting(profile)}
        </Text>
        <Text style={styles.subtitle}>{t('home_dashboard_subtitle')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_quick_start_title')}</Text>
        {currentRound ? (
          <>
            <Text style={styles.cardBody}>
              {t('home_dashboard_quick_start_resume', {
                course: currentRound.courseName ?? currentRound.courseId ?? t('home_dashboard_unknown_course'),
              })}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('RoundShot', { roundId: currentRound.id })}
              testID="resume-round"
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('home_dashboard_quick_start_resume_cta')}</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardBody}>{t('home_dashboard_quick_start_new_round')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RoundStart')} testID="start-round">
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('home_dashboard_quick_start_new_round_cta')}</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.rowSpaceBetween}>
          <Text style={styles.cardTitle}>{t('home_dashboard_last_round_title')}</Text>
          {latestRoundDisplay && (
            <TouchableOpacity
              onPress={() => navigation.navigate('RoundRecap', { roundId: latestRoundDisplay.roundId })}
              testID="view-last-round"
            >
              <Text style={styles.link}>{t('home_dashboard_last_round_cta')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {latestRoundDisplay ? (
          <>
            <Text style={styles.cardBody} testID="last-round-course">{latestRoundDisplay.course}</Text>
            {latestRoundDisplay.date && <Text style={styles.muted}>{latestRoundDisplay.date}</Text>}
            {latestRoundDisplay.score && <Text style={styles.score}>{latestRoundDisplay.score}</Text>}
          </>
        ) : (
          <Text style={styles.cardBody} testID="last-round-empty">
            {t('home_dashboard_last_round_empty')}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_weekly_title')}</Text>
        {weeklySummary ? (
          <>
            <Text style={styles.cardBody} testID="weekly-headline">
              {`${weeklySummary.headline.emoji ?? ''} ${weeklySummary.headline.text}`.trim()}
            </Text>
            <Text style={styles.muted}>
              {t('home_dashboard_weekly_summary', {
                rounds: weeklySummary.period.roundCount,
                avg: weeklySummary.coreStats.avgScore ?? '–',
              })}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('WeeklySummary')} testID="open-weekly">
              <Text style={styles.link}>{t('home_dashboard_weekly_cta')}</Text>
            </TouchableOpacity>
            {latestRoundDisplay ? (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('CoachReport', {
                    roundId: latestRoundDisplay.roundId,
                    courseName: latestRoundDisplay.course,
                    date: latestRoundDisplay.date ?? undefined,
                  })
                }
                testID="open-coach-report-weekly"
              >
                <Text style={styles.link}>{t('coach_report_cta_from_recap')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleShareWeekly}
              disabled={sharingWeekly}
              testID="share-weekly-dashboard"
            >
              {sharingWeekly ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.link}>{t('home_dashboard_weekly_share')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.cardBody}>{t('home_dashboard_weekly_empty')}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_practice_title')}</Text>
        <Text style={styles.cardBody} testID="practice-snippet">
          {practiceHeadline}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('PracticePlanner')} testID="open-practice">
          <Text style={styles.link}>{t('home_dashboard_practice_cta')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_bag_title')}</Text>
        <Text style={styles.cardBody} testID="bag-status">
          {t('home_dashboard_bag_status', {
            calibrated: bagSummary.calibrated,
            needs: bagSummary.needsMore,
          })}
        </Text>
        <Text style={styles.muted}>{t('home_dashboard_bag_helper')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MyBag')} testID="open-bag">
          <Text style={styles.link}>{t('home_dashboard_bag_cta')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#111827',
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#4b5563',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardBody: {
    fontSize: 14,
    color: '#1f2937',
  },
  muted: {
    color: '#6b7280',
    fontSize: 13,
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  link: {
    color: '#2563eb',
    fontWeight: '600',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
