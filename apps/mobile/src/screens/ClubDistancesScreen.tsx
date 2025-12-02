import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  clearClubDistanceOverride,
  fetchClubDistances,
  setClubDistanceOverride,
  type ClubDistanceStats,
} from '@app/api/clubDistanceClient';
import CaddieRiskHintsCard from '@app/components/CaddieRiskHintsCard';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubDistances'>;

type ClubRowProps = {
  stats: ClubDistanceStats;
  onSaveManual: (club: string, manualCarryM: number) => Promise<void>;
  onUseAuto: (club: string) => Promise<void>;
  isSaving: boolean;
};

function ClubRow({ stats, onSaveManual, onUseAuto, isSaving }: ClubRowProps): JSX.Element {
  const [manualInput, setManualInput] = useState(() =>
    stats.manualCarryM != null ? String(Math.round(stats.manualCarryM)) : '',
  );
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setManualInput(stats.manualCarryM != null ? String(Math.round(stats.manualCarryM)) : '');
  }, [stats.manualCarryM]);

  const baselineLabel = `${Math.round(stats.baselineCarryM)} m`;
  const samplesLabel = t('clubDistances.samples', { count: stats.samples });
  const dispersionLabel =
    stats.carryStdM && stats.carryStdM > 0
      ? t('clubDistances.dispersion', { value: Math.round(stats.carryStdM) })
      : null;
  const sourceLabel =
    stats.source === 'manual'
      ? t('clubDistances.source_manual')
      : t('clubDistances.source_auto');

  const parseManualInput = (): number | null => {
    const numeric = Number(manualInput);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setInputError(t('clubDistances.manual_error'));
      return null;
    }
    return numeric;
  };

  const handleSaveManual = async () => {
    const value = parseManualInput();
    if (value == null) return;
    setInputError(null);
    await onSaveManual(stats.club, value);
  };

  const handleToggle = async (useManual: boolean) => {
    if (useManual) {
      const value = parseManualInput();
      if (value == null) return;
      setInputError(null);
      await onSaveManual(stats.club, value);
      return;
    }
    setInputError(null);
    await onUseAuto(stats.club);
  };

  return (
    <View style={styles.row} testID="club-distance-row">
      <View style={styles.rowHeader}>
        <View>
          <Text style={styles.club}>{stats.club}</Text>
          <Text style={styles.samples}>{samplesLabel}</Text>
          <Text style={styles.source}>{sourceLabel}</Text>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.metricLabel}>{t('clubDistances.auto_label')}</Text>
          <Text style={styles.baseline}>{baselineLabel}</Text>
          {dispersionLabel ? <Text style={styles.dispersion}>{dispersionLabel}</Text> : null}
        </View>
      </View>

      <View style={styles.manualSection}>
        <View style={styles.manualHeader}>
          <Text style={styles.metricLabel}>{t('clubDistances.manual_label')}</Text>
          {stats.manualCarryM != null ? (
            <Text style={styles.manualValue}>
              {t('clubDistances.manual_current', { value: Math.round(stats.manualCarryM) })}
            </Text>
          ) : (
            <Text style={styles.manualValue}>{t('clubDistances.manual_empty')}</Text>
          )}
        </View>
        <TextInput
          style={styles.input}
          value={manualInput}
          onChangeText={setManualInput}
          placeholder={t('clubDistances.manual_placeholder')}
          keyboardType="numeric"
          inputMode="decimal"
          testID={`manual-input-${stats.club}`}
        />
        {inputError ? <Text style={styles.inlineError}>{inputError}</Text> : null}
        <View style={styles.manualActions}>
          <Pressable
            accessibilityRole="button"
            onPress={handleSaveManual}
            disabled={isSaving}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            testID={`save-manual-${stats.club}`}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? t('clubDistances.saving') : t('clubDistances.save_manual_button')}
            </Text>
          </Pressable>
          <View style={styles.switchRow}>
            <Text style={styles.toggleLabel}>
              {stats.source === 'manual'
                ? t('clubDistances.toggle_label_manual')
                : t('clubDistances.toggle_label_auto')}
            </Text>
            <Switch
              value={stats.source === 'manual'}
              onValueChange={handleToggle}
              testID={`toggle-source-${stats.club}`}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function updateClubList(clubs: ClubDistanceStats[], updated: ClubDistanceStats): ClubDistanceStats[] {
  const index = clubs.findIndex((c) => c.club === updated.club);
  if (index === -1) return [...clubs, updated];
  const clone = [...clubs];
  clone[index] = updated;
  return clone;
}

export default function ClubDistancesScreen({}: Props): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    clubs: ClubDistanceStats[];
    error: string | null;
    actionError: string | null;
    savingClub: string | null;
  }>({ loading: true, clubs: [], error: null, actionError: null, savingClub: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchClubDistances();
        if (!cancelled)
          setState({ loading: false, clubs: result ?? [], error: null, actionError: null, savingClub: null });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load';
          setState({ loading: false, clubs: [], error: message, actionError: null, savingClub: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveManual = async (club: string, manualCarryM: number) => {
    setState((prev) => ({ ...prev, savingClub: club, actionError: null }));
    try {
      const updated = await setClubDistanceOverride(club, manualCarryM, 'manual');
      setState((prev) => ({
        ...prev,
        savingClub: null,
        clubs: updateClubList(prev.clubs, updated),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('clubDistances.save_error');
      setState((prev) => ({ ...prev, savingClub: null, actionError: message }));
      throw err;
    }
  };

  const handleUseAuto = async (club: string) => {
    setState((prev) => ({ ...prev, savingClub: club, actionError: null }));
    try {
      const updated = await clearClubDistanceOverride(club);
      setState((prev) => ({
        ...prev,
        savingClub: null,
        clubs: updateClubList(prev.clubs, updated),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('clubDistances.save_error');
      setState((prev) => ({ ...prev, savingClub: null, actionError: message }));
      throw err;
    }
  };

  if (state.loading) {
    return (
      <View style={styles.center} testID="club-distances-loading">
        <ActivityIndicator />
        <Text style={styles.loading}>{t('clubDistances.loading')}</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.center} testID="club-distances-error">
        <Text style={styles.error}>{state.error}</Text>
      </View>
    );
  }

  if (!state.clubs.length) {
    return (
      <View style={styles.container} testID="club-distances-empty">
        <Text style={styles.title}>{t('clubDistances.title')}</Text>
        <Text style={styles.subtitle}>{t('clubDistances.subtitle')}</Text>
        <Text style={styles.helper}>{t('clubDistances.helper')}</Text>
        <Text style={styles.emptyTitle}>{t('clubDistances.empty_title')}</Text>
        <Text style={styles.emptyBody}>{t('clubDistances.empty_body')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('clubDistances.title')}</Text>
      <Text style={styles.subtitle}>{t('clubDistances.subtitle')}</Text>
      <Text style={styles.helper}>{t('clubDistances.helper')}</Text>
      <CaddieRiskHintsCard clubs={state.clubs.map((club) => club.club)} />
      {state.actionError ? <Text style={styles.errorBanner}>{state.actionError}</Text> : null}
      <FlatList
        data={state.clubs}
        keyExtractor={(item) => item.club}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ClubRow
            stats={item}
            onSaveManual={handleSaveManual}
            onUseAuto={handleUseAuto}
            isSaving={state.savingClub === item.club}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
  },
  helper: {
    color: '#0f172a',
    marginBottom: 4,
  },
  loading: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
  },
  errorBanner: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 8,
  },
  list: {
    gap: 10,
    paddingTop: 10,
  },
  row: {
    flexDirection: 'column',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  club: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  samples: {
    color: '#475569',
  },
  source: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  metrics: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    color: '#475569',
    fontSize: 12,
  },
  baseline: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 18,
  },
  dispersion: {
    color: '#0ea5e9',
  },
  manualSection: {
    gap: 8,
  },
  manualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manualValue: {
    color: '#0f172a',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
  manualActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    color: '#0f172a',
    fontWeight: '600',
  },
  inlineError: {
    color: '#b91c1c',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
  },
  emptyBody: {
    color: '#475569',
  },
});
