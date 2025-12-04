import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  DEFAULT_SETTINGS,
  loadCaddieSettings,
  saveCaddieSettings,
  type CaddieSettings,
  type RiskProfile,
  type ShotShapeIntent,
} from '@app/caddie/caddieSettingsStorage';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

const SHAPE_OPTIONS: ShotShapeIntent[] = ['fade', 'straight', 'draw'];
const RISK_OPTIONS: RiskProfile[] = ['safe', 'normal', 'aggressive'];

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieSetup'>;

export function CaddieSetupScreen({ navigation }: Props): JSX.Element {
  const [stockShape, setStockShape] = useState<ShotShapeIntent>(DEFAULT_SETTINGS.stockShape);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>(DEFAULT_SETTINGS.riskProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadCaddieSettings();
        if (!cancelled) {
          setStockShape(settings.stockShape);
          setRiskProfile(settings.riskProfile);
        }
      } catch (err) {
        console.warn('[caddie] Failed to load settings', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      setError(null);
      await saveCaddieSettings({ stockShape, riskProfile });
      navigation.goBack();
    } catch (err) {
      console.error('[caddie] Failed to save settings', err);
      setError(t('caddie.setup.save_error'));
    }
  };

  if (loading) {
    return (
      <View style={styles.center} testID="caddie-setup-loading">
        <ActivityIndicator />
        <Text style={styles.loading}>{t('caddie.decision.loading')}</Text>
      </View>
    );
  }

  const renderOption = <T extends string>(
    options: T[],
    selected: T,
    onSelect: (value: T) => void,
    testPrefix: string,
  ) => (
    <View style={styles.optionRow}>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          onPress={() => onSelect(option)}
          style={[styles.optionChip, selected === option && styles.optionChipActive]}
          testID={`${testPrefix}-${option}`}
        >
          <Text style={[styles.optionText, selected === option && styles.optionTextActive]}>
            {t(`caddie.setup.${testPrefix}_option.${option}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('caddie.setup.title')}</Text>
      <Text style={styles.subtitle}>{t('caddie.setup.subtitle')}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('caddie.setup.stock_shape_title')}</Text>
        <Text style={styles.body}>{t('caddie.setup.stock_shape_body')}</Text>
        {renderOption(SHAPE_OPTIONS, stockShape, setStockShape, 'stock_shape')}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('caddie.setup.risk_title')}</Text>
        <Text style={styles.body}>{t('caddie.setup.risk_body')}</Text>
        {renderOption(RISK_OPTIONS, riskProfile, setRiskProfile, 'risk_option')}
      </View>

      {error ? (
        <Text style={styles.error} testID="caddie-setup-error">
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('MyBag')}
        testID="caddie-setup-my-bag"
      >
        <Text style={styles.secondaryButtonText}>{t('my_bag_entry_settings')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} testID="caddie-setup-save">
        <Text style={styles.saveButtonText}>{t('caddie.setup.save_button')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loading: {
    marginTop: 8,
    color: '#6B7280',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
  },
  section: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  body: {
    color: '#4B5563',
    fontSize: 14,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  optionChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  optionChipActive: {
    backgroundColor: '#153bff',
    borderColor: '#153bff',
  },
  optionText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#ffffff',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  secondaryButtonText: {
    color: '#0ea5e9',
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default CaddieSetupScreen;
