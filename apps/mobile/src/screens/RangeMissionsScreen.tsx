import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { RANGE_MISSIONS, type RangeMission, getMissionById } from '@app/range/rangeMissions';
import {
  type RangeMissionState,
  loadRangeMissionState,
  setPinnedMission,
  toggleMissionCompleted,
} from '@app/range/rangeMissionsStorage';

function DifficultyBadge({ mission }: { mission: RangeMission }): JSX.Element | null {
  if (!mission.difficulty) return null;
  const label = mission.difficulty === 'easy' ? 'Easy' : mission.difficulty === 'medium' ? 'Medium' : 'Hard';
  return <Text style={styles.badge}>{label}</Text>;
}

function MissionKindBadge({ mission }: { mission: RangeMission }): JSX.Element | null {
  if (mission.kind !== 'tempo') return null;
  return <Text style={[styles.badge, styles.tempoBadge]}>{t('range.tempo.title')}</Text>;
}

type Props = NativeStackScreenProps<RootStackParamList, 'RangeMissions'>;

export default function RangeMissionsScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<RangeMissionState>({ completedMissionIds: [] });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    loadRangeMissionState()
      .then((value) => {
        if (!cancelled) setState(value);
      })
      .catch(() => {
        if (!cancelled) setState({ completedMissionIds: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pinnedMission = useMemo(() => {
    if (!state.pinnedMissionId) return undefined;
    return getMissionById(state.pinnedMissionId);
  }, [state.pinnedMissionId]);

  const handleToggleComplete = async (missionId: string) => {
    const next = await toggleMissionCompleted(missionId);
    setState(next);
  };

  const handlePin = async (missionId: string | undefined) => {
    const next = await setPinnedMission(missionId);
    setState(next);
  };

  const renderMission = (mission: RangeMission): JSX.Element => {
    const isCompleted = state.completedMissionIds.includes(mission.id);
    const isPinned = state.pinnedMissionId === mission.id;
    const isExpanded = expanded[mission.id] ?? false;
    return (
      <View key={mission.id} style={styles.card} testID={`mission-${mission.id}`}>
        <TouchableOpacity onPress={() => setExpanded((prev) => ({ ...prev, [mission.id]: !isExpanded }))}>
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{t(mission.titleKey)}</Text>
              <View style={styles.badgeRow}>
                <MissionKindBadge mission={mission} />
                <DifficultyBadge mission={mission} />
              </View>
            </View>
            <Text style={styles.cardSubtitle}>{t(mission.descriptionKey)}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && mission.recommendedClubs ? (
          <Text style={styles.helper}>Clubs: {mission.recommendedClubs.join(', ')}</Text>
        ) : null}
        {isExpanded && mission.recommendedShots ? (
          <Text style={styles.helper}>Recommended shots: {mission.recommendedShots}</Text>
        ) : null}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            accessibilityLabel={t('range.missions.toggle_complete')}
            onPress={() => handleToggleComplete(mission.id)}
            style={[styles.chipButton, isCompleted && styles.chipButtonActive]}
            testID={`toggle-complete-${mission.id}`}
          >
            <Text style={[styles.chipText, isCompleted && styles.chipTextActive]}>
              {isCompleted ? t('range.missions.completed_label') : t('range.missions.toggle_complete')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel={isPinned ? t('range.missions.unpin_button') : t('range.missions.pin_button')}
            onPress={() => handlePin(isPinned ? undefined : mission.id)}
            style={[styles.chipButton, isPinned && styles.chipButtonActive]}
            testID={`pin-mission-${mission.id}`}
          >
            <Text style={[styles.chipText, isPinned && styles.chipTextActive]}>
              {isPinned ? t('range.missions.unpin_button') : t('range.missions.pin_button')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          accessibilityLabel={t('range.missions.start_with_mission')}
          onPress={() => navigation.navigate('RangeQuickPracticeStart', { missionId: mission.id })}
          style={styles.startButton}
          testID={`start-mission-${mission.id}`}
        >
          <Text style={styles.startButtonText}>{t('range.missions.start_with_mission')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('range.missions.screen_title')}</Text>

      <View style={styles.pinnedCard} testID="pinned-section">
        <Text style={styles.sectionLabel}>{t('range.missions.pinned_title')}</Text>
        {pinnedMission ? (
          <>
            <Text style={styles.cardTitle}>{t(pinnedMission.titleKey)}</Text>
            <Text style={styles.cardSubtitle}>{t(pinnedMission.descriptionKey)}</Text>
            <Text style={styles.helper}>{t('range.missions.pinned_label')}</Text>
            <TouchableOpacity
              accessibilityLabel={t('range.missions.unpin_button')}
              onPress={() => handlePin(undefined)}
              style={styles.secondaryButton}
              testID="unpin-mission"
            >
              <Text style={styles.secondaryButtonText}>{t('range.missions.unpin_button')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>{t('range.missions.pinned_none_title')}</Text>
            <Text style={styles.cardSubtitle}>{t('range.missions.pinned_none_body')}</Text>
          </>
        )}
      </View>

      <View style={styles.list}>{RANGE_MISSIONS.map(renderMission)}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  pinnedCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  sectionLabel: {
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  cardHeader: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: '#EEF2FF',
    color: '#312E81',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '700',
    fontSize: 12,
  },
  tempoBadge: {
    backgroundColor: '#ECFDF3',
    color: '#065F46',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    color: '#4B5563',
  },
  helper: {
    color: '#6B7280',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  chipButtonActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF3',
  },
  chipText: {
    color: '#111827',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#065F46',
  },
  startButton: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  list: {
    gap: 12,
    marginTop: 8,
  },
});
