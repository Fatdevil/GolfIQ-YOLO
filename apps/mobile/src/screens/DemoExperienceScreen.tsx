import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { navigateToStartRound } from '@app/navigation/startRound';
import type { RoundRecap } from '@app/api/roundClient';
import type { WeeklySummary } from '@app/api/weeklySummaryClient';
import { fetchDemoRoundRecap, fetchDemoWeeklySummary } from '@app/demo/demoService';

const CATEGORY_ORDER: Array<keyof RoundRecap['categories']> = ['driving', 'approach', 'short_game', 'putting'];

type Props = NativeStackScreenProps<RootStackParamList, 'DemoExperience'>;

export default function DemoExperienceScreen({ navigation }: Props): JSX.Element {
  const [recap, setRecap] = useState<RoundRecap | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchDemoRoundRecap(), fetchDemoWeeklySummary()]).then(([recapResult, weeklyResult]) => {
      if (cancelled) return;
      if (recapResult.status === 'fulfilled') {
        setRecap(recapResult.value.recap);
      }
      if (weeklyResult.status === 'fulfilled') {
        setWeekly(weeklyResult.value);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('weekly.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('demo_experience_title')}</Text>

      {recap ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{recap.courseName}</Text>
          <Text style={styles.helper}>{t('round.recap.holes', { holes: recap.holesPlayed })}</Text>
          <View style={styles.grid}>
            {CATEGORY_ORDER.map((key) => {
              const category = recap.categories?.[key];
              if (!category) return null;
              return (
                <View key={key} style={styles.tile}>
                  <Text style={styles.tileLabel}>{category.label}</Text>
                  <Text style={styles.tileGrade}>{category.grade ?? '—'}</Text>
                </View>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('RoundRecap', { roundId: 'demo-round', isDemo: true })}
          >
            <Text style={styles.secondaryText}>{t('round.recap.title')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {weekly ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('weekly.title')}</Text>
          <Text style={styles.helper}>
            {t('weekly.subtitle', { rounds: weekly.roundsPlayed, holes: weekly.holesPlayed })}
          </Text>
          {weekly.highlight ? <Text style={styles.body}>{weekly.highlight.value}</Text> : null}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('WeeklySummary', { isDemo: true })}
          >
            <Text style={styles.secondaryText}>{t('weekly.share.cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.primaryButton} onPress={() => navigateToStartRound(navigation, 'recap')}>
        <Text style={styles.primaryText}>{t('demo_experience_start_own_round')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1224' },
  content: { padding: 20, gap: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  helper: { color: '#cbd5e1' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderWidth: 1, borderColor: '#1f2937', padding: 10, borderRadius: 10, width: '47%', gap: 4 },
  tileLabel: { color: '#e5e7eb', fontWeight: '600' },
  tileGrade: { color: '#22c55e', fontSize: 18, fontWeight: '700' },
  body: { color: '#e5e7eb' },
  primaryButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#0b1224', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#e5e7eb', fontWeight: '700' },
  muted: { color: '#cbd5e1', marginTop: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1224' },
});
