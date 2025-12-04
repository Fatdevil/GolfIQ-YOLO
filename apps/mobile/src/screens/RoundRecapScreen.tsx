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

import { fetchRoundRecap, type RoundRecap } from '@app/api/roundClient';
import { fetchRoundStrokesGained, type RoundStrokesGained } from '@app/api/strokesGainedClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundRecap'>;

const CATEGORY_ORDER: Array<keyof RoundRecap['categories']> = [
  'driving',
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

export default function RoundRecapScreen({ route }: Props): JSX.Element {
  const { roundId } = route.params ?? { roundId: '' };
  const [recap, setRecap] = useState<RoundRecap | null>(null);
  const [strokesGained, setStrokesGained] = useState<RoundStrokesGained | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sgError, setSgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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

    return () => {
      cancelled = true;
    };
  }, [roundId]);

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

  const handleShare = useCallback(async () => {
    if (!recap) return;
    const categories = recap.categories || {};
    const drivingGrade = categories.driving?.grade ?? '—';
    const approachGrade = categories.approach?.grade ?? '—';
    const shortGameGrade = categories.short_game?.grade ?? '—';
    const puttingGrade = categories.putting?.grade ?? '—';
    const firstHint = recap.focusHints[0] ?? t('round.recap.share_focus_fallback');
    const toPar = recap.toPar ?? t('round.recap.to_par_even');
    const score = recap.score ?? '—';

    const message = t('round.recap.share_template', {
      course: courseName,
      score,
      toPar,
      driving: drivingGrade,
      approach: approachGrade,
      shortGame: shortGameGrade,
      putting: puttingGrade,
      focus: firstHint,
    });

    try {
      await Share.share({ message });
    } catch (err) {
      console.warn('[round] Failed to share recap', err);
      Alert.alert(t('round.recap.share_error_title'), t('round.recap.share_error_body'));
    }
  }, [courseName, recap]);

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

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{t('round.recap.categories_title')}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleShare} testID="share-round">
            <Text style={styles.secondaryButtonText}>{t('round.recap.share_cta')}</Text>
          </TouchableOpacity>
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
  muted: { color: '#6b7280', marginTop: 4, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
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
});
