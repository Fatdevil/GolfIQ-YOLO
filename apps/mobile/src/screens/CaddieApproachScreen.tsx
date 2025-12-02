import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { fetchShotShapeProfile, type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import { fetchClubDistances } from '@app/api/clubDistanceClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  buildCaddieDecision,
  chooseClubForConditions,
  mapDistanceStatsToCandidate,
  type CaddieClubCandidate,
  type CaddieConditions,
  type CaddieDecisionOutput,
} from '@app/caddie/CaddieDecisionEngine';
import CaddieRecommendationCard from '@app/caddie/CaddieRecommendationCard';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

const INTENTS: ShotShapeIntent[] = ['straight', 'fade', 'draw'];

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieApproach'>;

export default function CaddieApproachScreen({}: Props): JSX.Element {
  const [conditions, setConditions] = useState<CaddieConditions>({
    targetDistanceM: 150,
    windSpeedMps: 2,
    windDirectionDeg: 0,
    elevationDeltaM: 0,
  });
  const [intent, setIntent] = useState<ShotShapeIntent>('straight');
  const [candidates, setCandidates] = useState<CaddieClubCandidate[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ShotShapeProfile | null>(null);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDistances(true);
    fetchClubDistances()
      .then((data) => {
        if (cancelled) return;
        setCandidates(data.map(mapDistanceStatsToCandidate));
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : t('caddie.decision.fallback');
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDistances(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const candidate = useMemo(() => {
    if (!candidates.length) return null;
    return chooseClubForConditions(conditions, candidates);
  }, [candidates, conditions]);

  useEffect(() => {
    setSelectedClub(candidate?.club ?? null);
    setProfile(null);
  }, [candidate]);

  useEffect(() => {
    if (!selectedClub) return;
    let cancelled = false;
    setProfileLoading(true);
    fetchShotShapeProfile(selectedClub, intent)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('caddie.decision.fallback'));
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [intent, selectedClub]);

  const decision: CaddieDecisionOutput | null = useMemo(() => {
    if (!selectedClub || !profile) return null;
    return buildCaddieDecision(conditions, intent, candidates, profile);
  }, [candidates, conditions, intent, profile, selectedClub]);

  const handleNumberChange = (field: keyof CaddieConditions, value: string) => {
    const numeric = Number(value);
    setConditions((prev) => ({ ...prev, [field]: Number.isFinite(numeric) ? numeric : prev[field] }));
  };

  if (loadingDistances) {
    return (
      <View style={styles.center} testID="caddie-approach-loading">
        <ActivityIndicator />
        <Text style={styles.loading}>{t('caddie.decision.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center} testID="caddie-approach-error">
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('caddie.decision.screen_title')}</Text>
      <Text style={styles.helper}>{t('caddie.decision.helper')}</Text>

      <View style={styles.inputs}>
        <View style={styles.inputRow}>
          <Text style={styles.label}>{t('caddie.decision.target_label')}</Text>
          <TextInput
            value={String(Math.round(conditions.targetDistanceM))}
            onChangeText={(text) => handleNumberChange('targetDistanceM', text)}
            keyboardType="numeric"
            style={styles.input}
            testID="target-distance-input"
          />
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>{t('caddie.decision.wind_label')}</Text>
          <TextInput
            value={String(conditions.windSpeedMps)}
            onChangeText={(text) => handleNumberChange('windSpeedMps', text)}
            keyboardType="numeric"
            style={styles.input}
            testID="wind-speed-input"
          />
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>{t('caddie.decision.wind_dir_label')}</Text>
          <TextInput
            value={String(conditions.windDirectionDeg)}
            onChangeText={(text) => handleNumberChange('windDirectionDeg', text)}
            keyboardType="numeric"
            style={styles.input}
            testID="wind-direction-input"
          />
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>{t('caddie.decision.elevation_label')}</Text>
          <TextInput
            value={String(conditions.elevationDeltaM)}
            onChangeText={(text) => handleNumberChange('elevationDeltaM', text)}
            keyboardType="numeric"
            style={styles.input}
            testID="elevation-input"
          />
        </View>
      </View>

      <Text style={styles.label}>{t('caddie.decision.intent_label')}</Text>
      <View style={styles.intentRow}>
        {INTENTS.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setIntent(option)}
            style={[styles.intentChip, intent === option && styles.intentChipActive]}
            testID={`intent-${option}`}
          >
            <Text style={styles.intentText}>{t(`caddie.intent_label.${option}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {profileLoading && <Text style={styles.loading}>{t('caddie.decision.loading')}</Text>}

      {decision ? (
        <CaddieRecommendationCard decision={decision} />
      ) : (
        <Text style={styles.fallback} testID="caddie-approach-fallback">
          {t('caddie.decision.fallback')}
        </Text>
      )}

      {candidate ? (
        <Text style={styles.helper} testID="selected-club-hint">
          Suggested club: {candidate.club}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loading: {
    marginTop: 8,
    color: '#c2c2d0',
  },
  error: {
    color: '#f66',
    fontSize: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
  },
  helper: {
    color: '#c2c2d0',
    fontSize: 14,
  },
  inputs: {
    gap: 8,
    marginVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: 'white',
    fontSize: 14,
    width: 200,
  },
  input: {
    backgroundColor: '#1c1c24',
    color: 'white',
    padding: 8,
    borderRadius: 8,
    minWidth: 80,
  },
  intentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  intentChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d36',
    backgroundColor: '#0a0a0e',
  },
  intentChipActive: {
    backgroundColor: '#153bff',
    borderColor: '#153bff',
  },
  intentText: {
    color: 'white',
    fontWeight: '600',
  },
  fallback: {
    color: '#c2c2d0',
  },
});
