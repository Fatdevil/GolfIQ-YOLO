import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@app/api/client';
import {
  fetchAccessPlan,
  fetchPlayerAnalytics,
  fetchPlayerProfile,
  type AccessPlan,
  type PlayerAnalytics,
  type PlayerProfile,
} from '@app/api/player';
import type { RootStackParamList } from '@app/navigation/types';
import { loadCurrentRun, type CurrentRun } from '@app/run/currentRun';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerHome'>;

type LastRoundSummary = {
  courseName: string;
  scoreRelativeToPar: string;
  dateLabel: string;
};

export type PlayerHomeState = {
  name: string;
  planLabel: string;
  isPro: boolean;
  lastRoundSummary?: LastRoundSummary | null;
};

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelativeDate(value?: string | null): string {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'Recent';
  }
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function derivePlanLabel(plan: AccessPlan): string {
  if (plan.plan === 'pro') {
    if (plan.trial) {
      const until = formatShortDate(plan.expires_at);
      return until ? `Pro trial until ${until}` : 'Pro trial';
    }
    const until = formatShortDate(plan.expires_at);
    return until ? `Pro until ${until}` : 'Pro';
  }
  return 'Free';
}

function deriveName(profile: PlayerProfile): string {
  return (profile.name ?? '').trim() || profile.memberId || 'Player';
}

function deriveLastRoundSummary(analytics?: PlayerAnalytics | null): LastRoundSummary | null {
  const lastPoint = analytics?.sgTrend?.[analytics.sgTrend.length - 1];
  if (!lastPoint) return null;
  const score = `${lastPoint.sgTotal >= 0 ? '+' : ''}${lastPoint.sgTotal.toFixed(1)} SG`;
  const dateLabel = formatRelativeDate(lastPoint.date);
  return {
    courseName: lastPoint.runId ? `Round ${lastPoint.runId}` : 'Latest round',
    scoreRelativeToPar: score,
    dateLabel,
  };
}

function buildHomeState(
  profile: PlayerProfile,
  plan: AccessPlan,
  analytics?: PlayerAnalytics | null,
): PlayerHomeState {
  return {
    name: deriveName(profile),
    planLabel: derivePlanLabel(plan),
    isPro: plan.plan === 'pro',
    lastRoundSummary: deriveLastRoundSummary(analytics),
  };
}

export default function HomeScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: PlayerHomeState | null;
    currentRun: CurrentRun | null;
  }>({ loading: true, error: null, data: null, currentRun: null });
  const { loading, error, data, currentRun } = state;

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [profile, accessPlan, existingRun] = await Promise.all([
        fetchPlayerProfile(),
        fetchAccessPlan(),
        loadCurrentRun(),
      ]);
      let analytics: PlayerAnalytics | null = null;
      if (accessPlan.plan === 'pro') {
        try {
          analytics = await fetchPlayerAnalytics();
        } catch (err) {
          // Analytics is pro-only; ignore 403 for now and allow the rest of the home shell to render.
          if (!(err instanceof ApiError && err.status === 403)) {
            throw err;
          }
        }
      }
      setState({
        loading: false,
        error: null,
        data: buildHomeState(profile, accessPlan, analytics),
        currentRun: existingRun,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load home';
      setState({ loading: false, error: message, data: null, currentRun: null });
    }
  }, []);

  useEffect(() => {
    load().catch(() => {
      /* handled in state */
    });
  }, [load]);

  const lastRoundSummary = useMemo(() => data?.lastRoundSummary ?? null, [data?.lastRoundSummary]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="home-loading" />
        <Text style={styles.loadingText}>Loading your GolfIQ…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="home-error">
          {error ?? 'Something went wrong'}
        </Text>
        <TouchableOpacity onPress={() => load().catch(() => {})} testID="home-retry">
          <View style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting} testID="home-greeting">
          Hi, {data.name} 👋
        </Text>
        <View style={styles.planBadge} testID="plan-badge">
          <Text style={styles.planBadgeText}>{data.planLabel}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ready to play?</Text>
        <Text style={styles.cardSubtitle}>Start a new round with GPS, scoring, and caddie tools.</Text>
        <TouchableOpacity
          accessibilityLabel="Play round"
          onPress={() => navigation.navigate('PlayCourseSelect')}
          testID="play-round-cta"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Play round</Text>
          </View>
        </TouchableOpacity>
      </View>

      {currentRun && (
        <TouchableOpacity onPress={() => navigation.navigate('PlayInRound')} testID="resume-round">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ongoing round</Text>
            <Text style={styles.cardSubtitle}>
              {currentRun.courseName} · {currentRun.teeName} · Hole {currentRun.currentHole} of {currentRun.holes}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RangePractice')}
            accessibilityLabel="Range practice"
            testID="range-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Range practice</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Trips')}
            accessibilityLabel="Trips"
            testID="trips-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Trips & buddies</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Last round</Text>
          {data.isPro && <Text style={styles.proPill}>Pro</Text>}
        </View>
        {lastRoundSummary ? (
          <View style={styles.summary} testID="last-round-summary">
            <Text style={styles.summaryTitle}>{lastRoundSummary.courseName}</Text>
            <Text style={styles.summaryScore}>{lastRoundSummary.scoreRelativeToPar}</Text>
            <Text style={styles.summaryDate}>{lastRoundSummary.dateLabel}</Text>
          </View>
        ) : (
          <Text style={styles.emptySummary} testID="empty-last-round">
            No rounds logged yet. Head out and play your first round!
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  planBadgeText: {
    color: '#4338ca',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: '#111827',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fef08a',
    color: '#854d0e',
    fontWeight: '700',
  },
  summary: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    gap: 4,
  },
  summaryTitle: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  summaryScore: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '700',
  },
  summaryDate: {
    color: '#6b7280',
    fontSize: 12,
  },
  emptySummary: {
    color: '#6b7280',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  loadingText: {
    color: '#374151',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
});
