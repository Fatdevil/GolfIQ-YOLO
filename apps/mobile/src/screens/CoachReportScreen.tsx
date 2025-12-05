import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchCoachRoundSummary, ProRequiredError, type CoachRoundSummary } from '@app/api/coachClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { fetchDemoCoachRound } from '@app/demo/demoService';

const SG_CATEGORY_ORDER: Array<{ key: keyof NonNullable<CoachRoundSummary['strokesGained']>; label: string }> = [
  { key: 'driving', label: t('weeklySummary.categories.driving') },
  { key: 'approach', label: t('weeklySummary.categories.approach') },
  { key: 'shortGame', label: t('weeklySummary.categories.short_game') },
  { key: 'putting', label: t('weeklySummary.categories.putting') },
];

type Props = NativeStackScreenProps<RootStackParamList, 'CoachReport'>;

function formatSgValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatDate(raw?: string | null): string {
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString();
}

export default function CoachReportScreen({ route, navigation }: Props): JSX.Element {
  const { roundId, courseName: courseNameParam, date: dateParam, isDemo } = route.params ?? { roundId: '' };
  const [summary, setSummary] = useState<CoachRoundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proRequired, setProRequired] = useState(false);

  const recommendedDrillIds = useMemo(
    () => summary?.recommendedDrills?.map((d) => d.id).filter(Boolean) ?? [],
    [summary?.recommendedDrills],
  );

  const fallbackCategories = useMemo(() => {
    const sg = summary?.strokesGained;
    if (!sg) return [] as string[];

    const pairs: Array<{ key: string; value: number }> = [
      { key: 'driving', value: sg.driving ?? 0 },
      { key: 'approach', value: sg.approach ?? 0 },
      { key: 'short_game', value: sg.shortGame ?? 0 },
      { key: 'putting', value: sg.putting ?? 0 },
    ];

    return pairs
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => a.value - b.value)
      .map((item) => item.key)
      .slice(0, 2);
  }, [summary?.strokesGained]);

  const handleStartPractice = () => {
    const drillIds = recommendedDrillIds;
    if (drillIds.length) {
      navigation.navigate('PracticePlanner', { focusDrillIds: drillIds, maxMinutes: 60 });
      return;
    }

    navigation.navigate('PracticePlanner', {
      focusCategories: fallbackCategories,
      maxMinutes: 60,
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProRequired(false);

    const loadDemo = async () => {
      const res = await fetchDemoCoachRound();
      if (cancelled) return;
      setSummary(res);
      setError(null);
      setProRequired(false);
      setLoading(false);
    };

    const loadReal = () =>
      fetchCoachRoundSummary(roundId)
        .then((res) => {
          if (cancelled) return;
          setSummary(res);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ProRequiredError) {
            setProRequired(true);
          } else {
            setError(t('coach_report_error'));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    if (isDemo) {
      loadDemo().catch(() => {
        if (!cancelled) {
          setError(t('coach_report_error'));
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

  const headerCourseName = summary?.courseName ?? courseNameParam ?? t('round.history.unnamed_course');
  const headerDate = formatDate(summary?.date ?? dateParam);
  const scoreLine = useMemo(() => {
    const score = summary?.score;
    const toPar = summary?.toPar;
    if (score == null && !toPar) return '';
    if (score == null) return `${toPar ?? ''}`.trim();
    if (!toPar) return `${score}`;
    return `${score} (${toPar})`;
  }, [summary?.score, summary?.toPar]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('coach_report_loading')}</Text>
      </View>
    );
  }

  if (error && !proRequired) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{t('coach_report_title')}</Text>
        <Text style={styles.muted}>{error}</Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            setError(null);
            setSummary(null);
            setProRequired(false);
            fetchCoachRoundSummary(roundId)
              .then((res) => {
                setSummary(res);
                setError(null);
              })
              .catch((err) => {
                if (err instanceof ProRequiredError) {
                  setProRequired(true);
                } else {
                  setError(t('coach_report_error'));
                }
              })
              .finally(() => setLoading(false));
          }}
          testID="coach-report-retry"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('weeklySummary.retry')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const strokes = summary?.strokesGained;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="coach-report"
      >
        <View style={[styles.header, proRequired && styles.dimmed]}>
          <Text style={styles.title}>{t('coach_report_title')}</Text>
          <Text style={styles.subtitle}>{headerCourseName}</Text>
          {headerDate ? <Text style={styles.muted}>{headerDate}</Text> : null}
          {scoreLine ? <Text style={styles.score}>{scoreLine}</Text> : null}
          {summary?.headline ? (
            <Text style={styles.headline} testID="coach-headline">{summary.headline}</Text>
          ) : null}
        </View>

        <View style={[styles.card, proRequired && styles.dimmed]}>
          <Text style={styles.cardTitle}>{t('strokesGained.roundSectionTitle')}</Text>
          {strokes ? (
            <>
              <View style={styles.sgHeaderRow}>
                <Text style={styles.sgLabel}>{t('strokesGained.totalLabel')}</Text>
                <Text
                  style={[
                    styles.sgValue,
                    (strokes.total ?? 0) >= 0 ? styles.positive : styles.negative,
                  ]}
                >
                  {formatSgValue(strokes.total)}
                </Text>
              </View>
              <View style={styles.grid}>
                {SG_CATEGORY_ORDER.map(({ key, label }) => (
                  <View key={key} style={styles.tile}>
                    <Text style={styles.tileLabel}>{label}</Text>
                    <Text style={[styles.sgValue, (strokes?.[key] ?? 0) >= 0 ? styles.positive : styles.negative]}>
                      {formatSgValue(strokes?.[key])}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.muted}>{t('strokesGained.unavailable')}</Text>
          )}
        </View>

        <View style={[styles.card, proRequired && styles.dimmed]}>
          <Text style={styles.cardTitle}>{t('coach_report_focus_title')}</Text>
          {summary?.focus?.length ? (
            summary.focus.map((item) => (
              <Text key={item} style={styles.bullet}>
                • {item}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>{t('round.recap.focus_empty')}</Text>
          )}
        </View>

        <View style={[styles.card, proRequired && styles.dimmed]}>
          <Text style={styles.cardTitle}>{t('coach_report_recommended_drills_title')}</Text>
          {summary?.recommendedDrills?.length ? (
            summary.recommendedDrills.map((drill) => (
              <View key={drill.id} style={styles.drillRow}>
                <View>
                  <Text style={styles.tileLabel}>{drill.name}</Text>
                  <Text style={styles.recommendedCategory}>{drill.category}</Text>
                </View>
                <Text style={styles.link}>{t('practice_planner_recommended')}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>{t('practice_planner_no_data')}</Text>
          )}
        </View>

        <TouchableOpacity onPress={handleStartPractice} testID="start-practice-button">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('coach_report_start_practice_button')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {proRequired ? (
        <View style={styles.overlay} testID="coach-pro-overlay">
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>{t('coach_report_pro_required_title')}</Text>
            <Text style={styles.overlayBody}>{t('coach_report_pro_required_body')}</Text>
            <View style={styles.overlayList}>
              <Text style={styles.overlayBullet}>• Advanced strokes gained insights</Text>
              <Text style={styles.overlayBullet}>• Coach focus for every round</Text>
              <Text style={styles.overlayBullet}>• Tailored drills in Practice Planner</Text>
            </View>
            <TouchableOpacity
              onPress={() => (Linking as any)?.openURL?.('https://golfiq.app/pro').catch(() => {})}
              testID="coach-upgrade"
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('coach_report_upgrade_button')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} testID="coach-upgrade-close">
              <Text style={styles.link}>{t('coach_report_close_button')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  subtitle: { color: '#1f2937', fontWeight: '600' },
  muted: { color: '#6b7280' },
  score: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  headline: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 6 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: '#fff',
  },
  tileLabel: { fontWeight: '600', color: '#111827' },
  sgHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sgLabel: { color: '#111827', fontWeight: '600' },
  sgValue: { fontSize: 18, fontWeight: '700' },
  positive: { color: '#047857' },
  negative: { color: '#b91c1c' },
  bullet: { color: '#111827' },
  link: { color: '#2563eb', fontWeight: '700' },
  rowSpaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recommendedCategory: {
    color: '#2563eb',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  overlayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    width: '100%',
    maxWidth: 420,
  },
  overlayTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  overlayBody: { color: '#1f2937' },
  overlayList: { gap: 4 },
  overlayBullet: { color: '#111827' },
  dimmed: { opacity: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
