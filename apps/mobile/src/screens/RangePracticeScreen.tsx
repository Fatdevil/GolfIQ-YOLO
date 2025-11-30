import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

export default function RangePracticeScreen({ navigation }: Props): JSX.Element {
  const [trainingGoal, setTrainingGoal] = useState<string | null>(null);

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

      <Text style={styles.title}>Range & Training</Text>
      <Text style={styles.subtitle}>Värm upp, följ din träning och lås upp fler insikter.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick practice</Text>
        <Text style={styles.cardSubtitle}>Hit a bucket with feedback and shot tracking.</Text>
        <TouchableOpacity
          accessibilityLabel="Start quick practice"
          onPress={() => navigation.navigate('RangeQuickPracticeStart')}
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

      <View style={styles.placeholderCard}>
        <Text style={styles.cardTitle}>Missions</Text>
        <Text style={styles.cardSubtitle}>Planned missions and gapping tools coming soon.</Text>
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
  placeholderCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    gap: 8,
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
