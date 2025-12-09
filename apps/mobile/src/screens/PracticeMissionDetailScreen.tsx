import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { fetchPlayerBag } from '@app/api/bagClient';
import { loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import type { BagPracticeRecommendation } from '@shared/caddie/bagPracticeRecommendations';
import { buildPracticeMissionDetail, type PracticeMissionDetail } from '@shared/practice/practiceHistory';

function formatDateTime(value: Date | null): string {
  if (!value) return t('practice.history.detail.unknown');
  return value.toLocaleString();
}

function MissionMeta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ProgressBar({ ratio }: { ratio: number | null }): JSX.Element | null {
  if (ratio == null) return null;
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${width}%` }]} />
    </View>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeMissionDetail'>;

type ScreenState = {
  loading: boolean;
  detail: PracticeMissionDetail | null;
};

export default function PracticeMissionDetailScreen({ navigation, route }: Props): JSX.Element {
  const { entryId } = route.params;
  const [state, setState] = useState<ScreenState>({ loading: true, detail: null });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [history, bag] = await Promise.all<[
          Awaited<ReturnType<typeof loadPracticeMissionHistory>>,
          Awaited<ReturnType<typeof fetchPlayerBag>> | null,
        ]>([loadPracticeMissionHistory(), fetchPlayerBag().catch(() => null)]);

        if (cancelled) return;

        const clubLabels = bag?.clubs.reduce<Record<string, string>>((acc, club) => {
          acc[club.clubId] = club.label;
          return acc;
        }, {}) ?? {};

        const detail = buildPracticeMissionDetail(history, entryId, { clubLabels });

        setState({ loading: false, detail });
      } catch (err) {
        if (!cancelled) {
          console.warn('[practice] Failed to load mission detail', err);
          setState({ loading: false, detail: null });
        }
      }
    };

    load().catch((err) => console.warn('[practice] mission detail load crashed', err));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const repeatConfig = useMemo<BagPracticeRecommendation | null>(() => {
    if (!state.detail || state.detail.targetClubs.length === 0) return null;
    return {
      id: `repeat:${state.detail.id}`,
      titleKey: 'practice.history.detail.repeatTitle',
      descriptionKey: 'practice.history.detail.repeatSubtitle',
      targetClubs: state.detail.targetClubs.map((club) => club.id),
      targetSampleCount: state.detail.targetSampleCount ?? undefined,
      sourceSuggestionId: state.detail.originSuggestionId ?? state.detail.missionId,
      status: 'fresh',
      priorityScore: 0,
      lastCompletedAt: state.detail.endedAt ?? state.detail.startedAt ?? null,
    };
  }, [state.detail]);

  if (state.loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.loading}>{t('practice.history.loading')}</Text>
      </View>
    );
  }

  if (!state.detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('practice.history.detail.title')}</Text>
        <Text style={styles.error}>{t('practice.history.detail.missing')}</Text>
      </View>
    );
  }

  const { detail } = state;
  const targetLabel =
    detail.targetSampleCount != null
      ? t('practice.history.samplesWithTarget', {
          completed: detail.completedSampleCount,
          target: detail.targetSampleCount,
        })
      : t('practice.history.samples', { completed: detail.completedSampleCount });

  const streakCopy = detail.countedTowardStreak
    ? t('practice.history.detail.streakYes')
    : t('practice.history.detail.streakNo');

  const repeatable = repeatConfig != null;

  const handleRepeat = () => {
    if (!repeatable || !repeatConfig) return;
    navigation.navigate('RangeQuickPracticeStart', {
      practiceRecommendation: repeatConfig,
      missionId: detail.missionKind === 'recommended' ? detail.missionId : undefined,
      entrySource: 'missions',
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('practice.history.detail.title')}</Text>

      <View style={styles.card}>
        <MissionMeta label={t('practice.history.detail.startedAt')} value={formatDateTime(detail.startedAt)} />
        <MissionMeta label={t('practice.history.detail.endedAt')} value={formatDateTime(detail.endedAt)} />
        <MissionMeta
          label={t('practice.history.detail.clubs')}
          value={
            detail.targetClubs.length > 0
              ? detail.targetClubs.map((club) => club.label).join(', ')
              : t('practice.history.anyClub')
          }
        />
        <MissionMeta label={t('practice.history.detail.samples')} value={targetLabel} />
        <MissionMeta
          label={t('practice.history.detail.completion')}
          value={detail.completionRatio != null ? `${Math.round(detail.completionRatio * 100)}%` : '—'}
        />
        <ProgressBar ratio={detail.completionRatio} />
        <Text style={styles.streak}>{streakCopy}</Text>
      </View>

      {repeatable ? (
        <TouchableOpacity onPress={handleRepeat} testID="repeat-mission-button">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('practice.history.detail.repeatCta')}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.mutedBox}>
          <Text style={styles.helper}>{t('practice.history.detail.unrepeatable')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  loading: {
    color: '#4B5563',
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: '#4B5563',
  },
  metaValue: {
    color: '#111827',
    fontWeight: '600',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  progressFill: {
    height: 8,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  streak: {
    color: '#2563EB',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  mutedBox: {
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  helper: {
    color: '#4B5563',
  },
  error: {
    color: '#B91C1C',
  },
});
