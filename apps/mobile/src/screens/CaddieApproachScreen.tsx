import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { fetchShotShapeProfile, type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import { fetchClubDistances } from '@app/api/clubDistanceClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  buildCaddieDecisionFromContext,
  chooseClubForTargetDistance,
  mapDistanceStatsToCandidate,
  riskProfileToBufferM,
  type CaddieClubCandidate,
  type CaddieConditions,
  type CaddieDecisionOutput,
} from '@app/caddie/CaddieDecisionEngine';
import CaddieRecommendationCard from '@app/caddie/CaddieRecommendationCard';
import {
  DEFAULT_SETTINGS,
  loadCaddieSettings,
  type CaddieSettings,
} from '@app/caddie/caddieSettingsStorage';
import { computePlaysLikeDistance } from '@app/caddie/caddieDistanceEngine';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { buildCaddieHudPayload } from '@app/caddie/caddieHudMapper';
import { isCaddieHudAvailable, sendCaddieHudClear, sendCaddieHudUpdate } from '@app/watch/caddieHudBridge';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import { MIN_AUTOCALIBRATED_SAMPLES, shouldUseBagStat } from '@shared/caddie/bagStats';

const INTENTS: ShotShapeIntent[] = ['straight', 'fade', 'draw'];

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieApproach'>;

export default function CaddieApproachScreen({ navigation }: Props): JSX.Element {
  const [settings, setSettings] = useState<CaddieSettings>(DEFAULT_SETTINGS);
  const [conditions, setConditions] = useState<CaddieConditions>({
    targetDistanceM: 150,
    windSpeedMps: 2,
    windDirectionDeg: 0,
    elevationDeltaM: 0,
  });
  const [intent, setIntent] = useState<ShotShapeIntent>(DEFAULT_SETTINGS.stockShape);
  const [candidates, setCandidates] = useState<CaddieClubCandidate[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ShotShapeProfile | null>(null);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [bagStats, setBagStats] = useState<BagClubStatsMap | null>(null);
  const intentTouchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const loaded = await loadCaddieSettings();
        if (cancelled) return;
        setSettings(loaded);
        if (!intentTouchedRef.current) {
          setIntent(loaded.stockShape);
        }
      } catch (err) {
        console.warn('[caddie] Failed to load caddie settings', err);
      }
    };

    loadSettings().catch(() => {
      /* handled above */
    });

    const unsubscribe = (navigation as any)?.addListener?.('focus', () => {
      loadSettings().catch(() => {
        /* handled above */
      });
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [navigation]);

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

  useEffect(() => {
    let cancelled = false;

    fetchBagStats()
      .then((stats) => {
        if (!cancelled) setBagStats(stats);
      })
      .catch(() => {
        if (!cancelled) setBagStats(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const calibratedCandidates = useMemo(() => {
    if (!bagStats) return candidates;
    return candidates.map((candidate) => {
      const stat = bagStats[candidate.club];
      const minSamples = MIN_AUTOCALIBRATED_SAMPLES;
      if (!stat) return candidate;
      if (!shouldUseBagStat(stat, minSamples)) {
        return {
          ...candidate,
          distanceSource: 'partial_stats',
          sampleCount: stat.sampleCount,
          minSamples,
        };
      }
      return {
        ...candidate,
        baselineCarryM: stat.meanDistanceM,
        samples: stat.sampleCount,
        source: 'auto' as const,
        distanceSource: 'auto_calibrated' as const,
        sampleCount: stat.sampleCount,
        minSamples,
      };
    });
  }, [bagStats, candidates]);

  const candidate = useMemo(() => {
    if (!calibratedCandidates.length) return null;
    const playsLike = computePlaysLikeDistance({
      targetDistanceM: conditions.targetDistanceM,
      windSpeedMps: conditions.windSpeedMps,
      windDirectionDeg: conditions.windDirectionDeg,
      elevationDeltaM: conditions.elevationDeltaM,
    });
    const buffer = riskProfileToBufferM(settings.riskProfile);
    return chooseClubForTargetDistance(playsLike, buffer, calibratedCandidates);
  }, [calibratedCandidates, conditions, settings.riskProfile]);

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
    const clubsForDecision = calibratedCandidates.length ? calibratedCandidates : candidates;
    return buildCaddieDecisionFromContext({
      conditions,
      explicitIntent: intent,
      settings,
      clubs: clubsForDecision,
      shotShapeProfile: profile,
    });
  }, [calibratedCandidates, candidates, conditions, intent, profile, selectedClub, settings]);

  useEffect(() => {
    if (!isCaddieHudAvailable()) return;
    if (!decision) {
      sendCaddieHudClear();
      return;
    }

    const hudPayload = buildCaddieHudPayload(decision, settings, {
      rawDistanceM: conditions.targetDistanceM,
    });
    sendCaddieHudUpdate(hudPayload);
  }, [conditions.targetDistanceM, decision, settings]);

  useEffect(() => {
    return () => {
      if (isCaddieHudAvailable()) {
        sendCaddieHudClear();
      }
    };
  }, []);

  const handleNumberChange = (field: keyof CaddieConditions, value: string) => {
    const numeric = Number(value);
    setConditions((prev) => ({ ...prev, [field]: Number.isFinite(numeric) ? numeric : prev[field] }));
  };

  const handleIntentSelect = (option: ShotShapeIntent) => {
    intentTouchedRef.current = true;
    setIntent(option);
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

  const profileLabel = t('caddie.decision.profile_badge', {
    profile: t(`caddie.decision.profile_label.${settings.riskProfile}`),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('caddie.decision.screen_title')}</Text>
          <Text style={styles.helper}>{t('caddie.decision.helper')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('CaddieSetup')}
          style={styles.settingsButton}
          testID="caddie-open-setup"
        >
          <Text style={styles.settingsButtonText}>{t('caddie.setup.title')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helper}>{profileLabel}</Text>

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
            onPress={() => handleIntentSelect(option)}
            style={[styles.intentChip, intent === option && styles.intentChipActive]}
            testID={`intent-${option}`}
          >
            <Text style={styles.intentText}>{t(`caddie.intent_label.${option}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {profileLoading && <Text style={styles.loading}>{t('caddie.decision.loading')}</Text>}

      {decision ? (
        <CaddieRecommendationCard decision={decision} settings={settings} />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
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
  settingsButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d2d36',
    backgroundColor: '#0a0a0e',
  },
  settingsButtonText: {
    color: 'white',
    fontWeight: '600',
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
