import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import {
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
} from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';
import { trackWeeklyPracticeGoalSettingsUpdated } from '@shared/practice/practiceGoalAnalytics';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';

const TARGET_OPTIONS = [1, 3, 5];

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklyPracticeGoalSettings'>;

export default function WeeklyPracticeGoalSettingsScreen({ navigation }: Props): JSX.Element {
  const defaultSettings = getDefaultWeeklyPracticeGoalSettings();
  const [loading, setLoading] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState(defaultSettings.targetMissionsPerWeek);
  const [savingTarget, setSavingTarget] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWeeklyPracticeGoalSettings()
      .then((settings) => {
        if (!cancelled) {
          setSelectedTarget(settings.targetMissionsPerWeek);
        }
      })
      .catch((err) => console.warn('[practiceGoalSettings] Failed to load settings screen', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (target: number) => {
    if (target === selectedTarget) {
      navigation.goBack();
      return;
    }

    const previousTarget = selectedTarget;
    setSelectedTarget(target);
    setSavingTarget(target);
    try {
      const nextSettings = { targetMissionsPerWeek: target };
      await saveWeeklyPracticeGoalSettings(nextSettings);
      trackWeeklyPracticeGoalSettingsUpdated(
        { emit: safeEmit },
        {
          previousTarget,
          newTarget: nextSettings.targetMissionsPerWeek,
          source: 'mobile_settings_screen',
        },
      );
      navigation.goBack();
    } catch (err) {
      console.warn('[practiceGoalSettings] Failed to save from settings screen', err);
    } finally {
      setSavingTarget(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container} testID="weekly-practice-goal-settings-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="weekly-practice-goal-settings">
      <Text style={styles.title}>{t('practice.goal.settings.title')}</Text>
      <Text style={styles.subtitle}>{t('practice.goal.settings.subtitle')}</Text>

      <View style={styles.options}>
        {TARGET_OPTIONS.map((target) => {
          const isSelected = target === selectedTarget;
          return (
            <TouchableOpacity
              key={target}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => handleSelect(target)}
              disabled={savingTarget !== null}
              testID={`weekly-goal-option-${target}`}
            >
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.optionLabel}>
                {t('practice.goal.settings.optionLabel', { count: target })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#4b5563',
    fontSize: 14,
  },
  options: {
    marginTop: 8,
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    gap: 12,
  },
  optionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#2563eb',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
  },
  optionLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
});
