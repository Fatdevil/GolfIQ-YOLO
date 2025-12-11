import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeCameraAngle } from '@app/range/rangeSession';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';
import { getMissionById } from '@app/range/rangeMissions';
import { t } from '@app/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeStart'>;

const angleDescriptions: Record<RangeCameraAngle, string> = {
  down_the_line: 'Kamera bakom dig, riktad genom bollen mot målet.',
  face_on: 'Kamera vid sidan, vinkelrätt mot mållinjen.',
};

export default function RangeQuickPracticeStartScreen({ navigation, route }: Props): JSX.Element {
  const missionId = route.params?.missionId;
  const practiceRecommendation = route.params?.practiceRecommendation;
  const entrySource = route.params?.entrySource;
  const practiceRecommendationContext = route.params?.practiceRecommendationContext;
  const mission = missionId ? getMissionById(missionId) : undefined;
  const [club, setClub] = useState(() => practiceRecommendation?.targetClubs?.[0] ?? '');
  const [targetDistance, setTargetDistance] = useState('');
  const [selectedAngle, setSelectedAngle] = useState<RangeCameraAngle>('down_the_line');
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

  const selectedLabel = useMemo(
    () => (selectedAngle === 'down_the_line' ? 'Down-the-line' : 'Face-on'),
    [selectedAngle],
  );

  const recommendationTitle = useMemo(() => {
    if (!practiceRecommendation) return null;
    const [lower, upper] = practiceRecommendation.targetClubs;
    return t(practiceRecommendation.titleKey, {
      lower,
      upper,
      club: lower,
    });
  }, [practiceRecommendation]);

  useEffect(() => {
    if (practiceRecommendation?.targetClubs?.[0]) {
      setClub(practiceRecommendation.targetClubs[0]);
    }
  }, [practiceRecommendation?.targetClubs]);

  const handleStart = () => {
    const trimmedClub = club.trim();
    const parsedDistance = Number(targetDistance);
    const hasDistance = targetDistance.trim().length > 0 && Number.isFinite(parsedDistance);
    navigation.navigate('RangeCameraSetup', {
      club: trimmedClub ? trimmedClub : null,
      targetDistanceM: hasDistance ? parsedDistance : null,
      cameraAngle: selectedAngle,
      missionId,
      practiceRecommendation,
      entrySource,
      practiceRecommendationContext,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Quick practice</Text>
      <Text style={styles.subtitle}>
        Välj kamera-vinkel och mål så guidar vi dig genom uppställningen innan inspelningen startar.
      </Text>
      {practiceRecommendation && recommendationTitle ? (
        <View style={styles.recommendationPill} testID="range-start-recommendation">
          <Text style={styles.helper}>{t('bag.practice.recommendedHelper')}</Text>
          <Text style={styles.recommendationTitle}>{recommendationTitle}</Text>
        </View>
      ) : null}
      {trainingGoal ? (
        <Text style={styles.goalInline} numberOfLines={2}>
          {t('range.trainingGoal.current_inline', { text: trainingGoal })}
        </Text>
      ) : (
        <TouchableOpacity
          onPress={() => navigation.navigate('RangeTrainingGoal')}
          style={styles.goalLinkContainer}
          testID="set-training-goal-link"
        >
          <Text style={styles.goalLink}>{t('range.trainingGoal.set_button')}</Text>
        </TouchableOpacity>
      )}

      {mission ? (
        <View style={styles.missionCard} testID="mission-banner">
          <Text style={styles.sectionLabel}>{t('range.missions.session_label')}</Text>
          <Text style={styles.missionTitle}>{t(mission.titleKey)}</Text>
          <Text style={styles.helper}>{t(mission.descriptionKey)}</Text>
        </View>
      ) : null}

      <View style={styles.selectorHeader}>
        <Text style={styles.selectorLabel}>Kameravinkel</Text>
        <Text testID="selected-angle-label" style={styles.selectorValue}>
          {selectedLabel}
        </Text>
      </View>

      <View style={styles.segmentGroup}>
        <TouchableOpacity
          onPress={() => setSelectedAngle('down_the_line')}
          style={[styles.segment, selectedAngle === 'down_the_line' && styles.segmentSelected]}
          testID="angle-option-dtl"
        >
          <Text style={styles.segmentTitle}>Down-the-line</Text>
          <Text style={styles.segmentSubtitle}>{angleDescriptions.down_the_line}</Text>
          {selectedAngle === 'down_the_line' && <Text style={styles.segmentBadge}>Vald</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSelectedAngle('face_on')}
          style={[styles.segment, selectedAngle === 'face_on' && styles.segmentSelected]}
          testID="angle-option-face"
        >
          <Text style={styles.segmentTitle}>Face-on</Text>
          <Text style={styles.segmentSubtitle}>{angleDescriptions.face_on}</Text>
          {selectedAngle === 'face_on' && <Text style={styles.segmentBadge}>Vald</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Klubba (valfritt)</Text>
        <TextInput
          value={club}
          onChangeText={setClub}
          placeholder="7-iron"
          style={styles.input}
          testID="club-input"
        />

        <Text style={styles.label}>Mål (meter, valfritt)</Text>
        <TextInput
          value={targetDistance}
          onChangeText={setTargetDistance}
          placeholder="140"
          keyboardType="numeric"
          style={styles.input}
          testID="target-input"
        />
      </View>

      <TouchableOpacity
        accessibilityLabel="Start session"
        onPress={handleStart}
        style={styles.primaryButton}
        testID="start-quick-practice"
      >
        <Text style={styles.primaryButtonText}>Gå till kamera-setup</Text>
      </TouchableOpacity>
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
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  recommendationPill: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ECFDF3',
    gap: 4,
  },
  recommendationTitle: {
    color: '#065F46',
    fontWeight: '700',
  },
  goalInline: {
    color: '#111827',
  },
  missionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  missionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  helper: {
    color: '#4B5563',
  },
  goalLinkContainer: {
    alignSelf: 'flex-start',
  },
  goalLink: {
    color: '#2563EB',
    fontWeight: '600',
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorLabel: {
    fontWeight: '600',
  },
  selectorValue: {
    color: '#111827',
  },
  segmentGroup: {
    gap: 12,
  },
  segment: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  segmentSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF3',
  },
  segmentTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  segmentSubtitle: {
    color: '#4B5563',
  },
  segmentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
  },
  sectionLabel: {
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  form: {
    marginTop: 8,
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
