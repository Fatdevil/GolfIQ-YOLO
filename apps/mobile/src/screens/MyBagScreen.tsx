import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchPlayerBag,
  updatePlayerClubs,
  type ClubDistance,
  type ClubUpdate,
} from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { MIN_AUTOCALIBRATED_SAMPLES, shouldUseBagStat } from '@shared/caddie/bagStats';
import type { BagClubStats, BagClubStatsMap } from '@shared/caddie/bagStats';
import { analyzeBagGaps, type ClubDataStatus } from '@shared/caddie/bagGapInsights';
import { formatDistance } from '@app/utils/distance';

type Props = NativeStackScreenProps<RootStackParamList, 'MyBag'>;

type ScreenState = {
  loading: boolean;
  bag: { clubs: ClubDistance[] } | null;
  bagStats: BagClubStatsMap | null;
  error: string | null;
  actionError: string | null;
  savingClub: string | null;
};

type ClubWithStats = ClubDistance & { bagStat?: BagClubStats };

type ClubCardProps = {
  club: ClubWithStats;
  onUpdate: (update: ClubUpdate) => Promise<void>;
  isSaving: boolean;
  status?: ClubDataStatus;
};

function formatCarryLabel(club: ClubDistance): string {
  const source = club.manualAvgCarryM ?? club.avgCarryM;
  if (source == null) return t('my_bag_not_calibrated');
  return formatDistance(source, { withUnit: true });
}

function formatSampleLabel(club: ClubDistance): string {
  if (club.sampleCount > 0) {
    return t('my_bag_sample_count_label', { count: club.sampleCount });
  }
  return t('my_bag_not_calibrated');
}

function ClubCard({ club, onUpdate, isSaving, status }: ClubCardProps): JSX.Element {
  const [label, setLabel] = useState(club.label);
  const [manualInput, setManualInput] = useState(
    club.manualAvgCarryM != null
      ? String(Math.round(club.manualAvgCarryM))
      : club.avgCarryM != null
        ? String(Math.round(club.avgCarryM))
        : '',
  );
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(club.label);
    setManualInput(
      club.manualAvgCarryM != null
        ? String(Math.round(club.manualAvgCarryM))
        : club.avgCarryM != null
          ? String(Math.round(club.avgCarryM))
          : '',
    );
  }, [club.label, club.manualAvgCarryM, club.avgCarryM]);

  const parseManual = (): number | null | undefined => {
    const trimmed = manualInput.trim();
    if (trimmed.length === 0) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) {
      setInputError(t('my_bag_validation_error'));
      return undefined;
    }
    return value;
  };

  const handleSave = async () => {
    const nextManual = parseManual();
    if (nextManual === undefined) return;
    setInputError(null);
    const update: ClubUpdate = { clubId: club.clubId };
    if (label.trim() && label.trim() !== club.label) update.label = label.trim();
    update.manualAvgCarryM = nextManual;
    await onUpdate(update);
  };

  const handleClearManual = async () => {
    setInputError(null);
    await onUpdate({ clubId: club.clubId, manualAvgCarryM: null });
  };

  const handleToggleActive = async (value: boolean) => {
    await onUpdate({ clubId: club.clubId, active: value });
  };

  const autoCarryLabel = shouldUseBagStat(club.bagStat)
    ? formatDistance(club.bagStat.meanDistanceM, { withUnit: true })
    : null;

  const autoHint = club.bagStat
    ? shouldUseBagStat(club.bagStat)
      ? t('my_bag_auto_samples', { count: club.bagStat.sampleCount })
      : t('my_bag_auto_need_more', {
          count: club.bagStat.sampleCount,
          min: MIN_AUTOCALIBRATED_SAMPLES,
        })
    : null;

  return (
    <View style={styles.card} testID={`club-card-${club.clubId}`}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.clubLabel}>{label || club.label}</Text>
          <Text style={styles.muted}>{formatSampleLabel(club)}</Text>
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('my_bag_in_bag_label')}</Text>
          <Switch
            value={club.active}
            onValueChange={handleToggleActive}
            testID={`toggle-${club.clubId}`}
          />
        </View>
      </View>

      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.muted}>{t('my_bag_avg_carry_label')}</Text>
          <Text style={styles.carryValue}>{formatCarryLabel(club)}</Text>
        </View>
        {club.manualAvgCarryM != null ? (
          <Text style={styles.manualPill}>{t('my_bag_manual_override')}</Text>
        ) : null}
      </View>

      {autoCarryLabel ? (
        <View style={styles.autoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.autoLabel}>{t('my_bag_auto_calibrated_label')}</Text>
            {autoHint ? <Text style={styles.muted}>{autoHint}</Text> : null}
          </View>
          <Text style={styles.autoCarry}>{autoCarryLabel}</Text>
        </View>
      ) : autoHint ? (
        <Text style={styles.autoHint}>{autoHint}</Text>
      ) : null}

      {status === 'needs_more_samples' && !autoCarryLabel && !autoHint ? (
        <Text style={styles.autoHint}>{t('bag.insights.needs_more_samples')}</Text>
      ) : null}
      {status === 'no_data' ? (
        <Text style={styles.autoHint}>{t('bag.insights.no_data')}</Text>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('my_bag_label_field')}</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t('my_bag_label_placeholder')}
          style={styles.input}
          testID={`label-input-${club.clubId}`}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('my_bag_manual_field')}</Text>
        <TextInput
          value={manualInput}
          onChangeText={setManualInput}
          placeholder={t('my_bag_manual_placeholder')}
          inputMode="decimal"
          keyboardType="numeric"
          style={styles.input}
          testID={`manual-input-${club.clubId}`}
        />
        {inputError ? <Text style={styles.error}>{inputError}</Text> : null}
        <View style={styles.rowBetween}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={[styles.primaryButton, isSaving && styles.disabledButton]}
            testID={`save-${club.clubId}`}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? t('my_bag_saving') : t('my_bag_edit_button')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleClearManual}
            disabled={isSaving}
            style={styles.secondaryButton}
            testID={`clear-manual-${club.clubId}`}
          >
            <Text style={styles.linkText}>{t('my_bag_clear_manual')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function attachStats(clubs: ClubDistance[], stats: BagClubStatsMap | null): ClubWithStats[] {
  if (!stats) return clubs;
  return clubs.map((club) => ({ ...club, bagStat: stats[club.clubId] }));
}

type GroupedClubs = {
  title: string;
  clubs: ClubWithStats[];
};

function groupClubs(clubs: ClubWithStats[]): GroupedClubs[] {
  const groups: Record<string, ClubWithStats[]> = {
    woods: [],
    irons: [],
    wedges: [],
    putter: [],
    other: [],
  };

  clubs.forEach((club) => {
    if (['driver', '3w', '5w', '3h'].includes(club.clubId)) groups.woods.push(club);
    else if (/^[4-9]i$/.test(club.clubId)) groups.irons.push(club);
    else if (['pw', 'gw', 'sw', 'lw'].includes(club.clubId)) groups.wedges.push(club);
    else if (club.clubId === 'putter') groups.putter.push(club);
    else groups.other.push(club);
  });

  const titles: Record<keyof typeof groups, string> = {
    woods: t('my_bag_group_woods'),
    irons: t('my_bag_group_irons'),
    wedges: t('my_bag_group_wedges'),
    putter: t('my_bag_group_putter'),
    other: t('my_bag_group_other'),
  };

  return (Object.keys(groups) as (keyof typeof groups)[])
    .map((key) => ({ title: titles[key], clubs: groups[key] }))
    .filter((group) => group.clubs.length > 0);
}

export default function MyBagScreen({}: Props): JSX.Element {
  const [state, setState] = useState<ScreenState>({
    loading: true,
    bag: null,
    bagStats: null,
    error: null,
    actionError: null,
    savingClub: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bag = await fetchPlayerBag();
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            loading: false,
            bag,
            error: null,
            actionError: null,
            savingClub: null,
          }));
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t('my_bag_error');
          setState((prev) => ({
            ...prev,
            loading: false,
            bag: null,
            error: message,
            actionError: null,
            savingClub: null,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchBagStats()
      .then((stats) => {
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            bagStats: stats,
          }));
      })
      .catch((err) => {
        console.warn('[bagStats] failed to load bag stats for bag screen', err);
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            bagStats: null,
          }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = async (update: ClubUpdate) => {
    setState((prev) => ({ ...prev, savingClub: update.clubId, actionError: null }));
    try {
      const bag = await updatePlayerClubs([update]);
      setState((prev) => ({ ...prev, bag, savingClub: null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('my_bag_update_error');
      setState((prev) => ({ ...prev, savingClub: null, actionError: message }));
    }
  };

  const clubsWithStats = useMemo(
    () => attachStats(state.bag?.clubs ?? [], state.bagStats),
    [state.bag?.clubs, state.bagStats],
  );

  const gapAnalysis = useMemo(
    () =>
      state.bag && state.bagStats
        ? analyzeBagGaps(state.bag, state.bagStats)
        : { insights: [], dataStatusByClubId: {} },
    [state.bag, state.bagStats],
  );

  const dataStatuses = useMemo(
    () => (state.bag && state.bagStats ? gapAnalysis.dataStatusByClubId : {}),
    [gapAnalysis.dataStatusByClubId, state.bag, state.bagStats],
  );

  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    state.bag?.clubs.forEach((club) => {
      labels[club.clubId] = club.label;
    });
    return labels;
  }, [state.bag?.clubs]);

  const groups = useMemo(() => groupClubs(clubsWithStats), [clubsWithStats]);

  if (state.loading) {
    return (
      <View style={styles.center} testID="my-bag-loading">
        <ActivityIndicator />
        <Text style={styles.muted}>{t('my_bag_loading')}</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.center} testID="my-bag-error">
        <Text style={styles.error}>{state.error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID="my-bag-screen">
      <Text style={styles.title}>{t('my_bag_title')}</Text>
      <Text style={styles.subtitle}>{t('my_bag_subtitle')}</Text>
      {state.actionError ? <Text style={styles.errorBanner}>{state.actionError}</Text> : null}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{t('my_bag_avg_carry_label')}</Text>
        <Text style={styles.infoBody}>{t('my_bag_calibration_hint')}</Text>
      </View>

      {gapAnalysis.insights.length > 0 ? (
        <View style={styles.infoCard} testID="bag-insights">
          <Text style={styles.infoTitle}>{t('bag.insights.title')}</Text>
          <View style={{ gap: 4 }}>
            {gapAnalysis.insights.slice(0, 3).map((insight) => {
              const distanceLabel = formatDistance(insight.gapDistance, { withUnit: true });
              const lower = clubLabels[insight.lowerClubId] ?? insight.lowerClubId;
              const upper = clubLabels[insight.upperClubId] ?? insight.upperClubId;
              const label =
                insight.type === 'large_gap'
                  ? t('bag.insights.large_gap', { lower, upper, distance: distanceLabel })
                  : t('bag.insights.overlap', { lower, upper, distance: distanceLabel });
              return (
                <Text key={`${insight.lowerClubId}-${insight.upperClubId}`} style={styles.infoBody}>
                  {label}
                </Text>
              );
            })}
          </View>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.title} style={styles.group} testID={`group-${group.title}`}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.clubs.map((club) => (
            <ClubCard
              key={club.clubId}
              club={club}
              onUpdate={handleUpdate}
              isSaving={state.savingClub === club.clubId}
              status={dataStatuses[club.clubId]}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  subtitle: { color: '#475569', marginBottom: 8 },
  muted: { color: '#6b7280' },
  error: { color: '#b91c1c' },
  errorBanner: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 8,
  },
  infoCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoTitle: { fontWeight: '700', color: '#0f172a' },
  infoBody: { color: '#1f2937', marginTop: 4 },
  group: { gap: 10 },
  groupTitle: { fontWeight: '700', fontSize: 18, color: '#0f172a' },
  card: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  clubLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: '#0f172a', fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  carryValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  manualPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    color: '#312e81',
    fontWeight: '700',
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  autoLabel: { color: '#0f172a', fontWeight: '700' },
  autoCarry: { fontWeight: '700', color: '#0ea5e9', fontSize: 16 },
  autoHint: { color: '#6b7280' },
  inputGroup: { gap: 6 },
  inputLabel: { color: '#0f172a', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  disabledButton: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: '#0ea5e9', fontWeight: '700' },
});

