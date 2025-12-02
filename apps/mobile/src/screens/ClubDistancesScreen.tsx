import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchClubDistances, type ClubDistanceStats } from '@app/api/clubDistanceClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubDistances'>;

function ClubRow({ stats }: { stats: ClubDistanceStats }): JSX.Element {
  const baselineLabel = `${Math.round(stats.baselineCarryM)} m`;
  const samplesLabel = t('clubDistances.samples', { count: stats.samples });
  const dispersionLabel =
    stats.carryStdM && stats.carryStdM > 0
      ? t('clubDistances.dispersion', { value: Math.round(stats.carryStdM) })
      : null;

  return (
    <View style={styles.row} testID="club-distance-row">
      <View>
        <Text style={styles.club}>{stats.club}</Text>
        <Text style={styles.samples}>{samplesLabel}</Text>
      </View>
      <View style={styles.metrics}>
        <Text style={styles.baseline}>{baselineLabel}</Text>
        {dispersionLabel ? <Text style={styles.dispersion}>{dispersionLabel}</Text> : null}
      </View>
    </View>
  );
}

export default function ClubDistancesScreen({}: Props): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    clubs: ClubDistanceStats[];
    error: string | null;
  }>({ loading: true, clubs: [], error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchClubDistances();
        if (!cancelled) setState({ loading: false, clubs: result ?? [], error: null });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load';
          setState({ loading: false, clubs: [], error: message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <Text style={styles.emptyTitle}>{t('clubDistances.empty_title')}</Text>
        <Text style={styles.emptyBody}>{t('clubDistances.empty_body')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('clubDistances.title')}</Text>
      <Text style={styles.subtitle}>{t('clubDistances.subtitle')}</Text>
      <FlatList
        data={state.clubs}
        keyExtractor={(item) => item.club}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ClubRow stats={item} />}
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
  loading: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
  },
  list: {
    gap: 10,
    paddingTop: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  club: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  samples: {
    color: '#475569',
  },
  metrics: {
    alignItems: 'flex-end',
  },
  baseline: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  dispersion: {
    color: '#0ea5e9',
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
