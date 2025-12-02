import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchShotShapeProfile, type ShotShapeIntent, type ShotShapeProfile } from '@app/api/caddieApi';
import { computeRiskZonesFromProfile } from '@app/caddie/caddieDistanceEngine';
import { t } from '@app/i18n';

const INTENTS: ShotShapeIntent[] = ['straight', 'fade', 'draw'];

type Props = {
  clubs: string[];
};

function formatMeters(value: number): string {
  return `${Math.round(value)} m`;
}

function intentLabel(intent: ShotShapeIntent): string {
  return t(`caddie.intent_label.${intent}`);
}

export function CaddieRiskHintsCard({ clubs }: Props): JSX.Element | null {
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [intent, setIntent] = useState<ShotShapeIntent>('straight');
  const [profile, setProfile] = useState<ShotShapeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedClub((prev) => prev ?? clubs[0] ?? null);
  }, [clubs]);

  useEffect(() => {
    if (!selectedClub) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchShotShapeProfile(selectedClub, intent)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [intent, selectedClub]);

  const summary = useMemo(() => (profile ? computeRiskZonesFromProfile(profile) : null), [profile]);

  if (!clubs.length || !selectedClub) return null;

  return (
    <View style={styles.card} testID="caddie-risk-card">
      <Text style={styles.title}>{t('caddie.risk.title')}</Text>

      <Text style={styles.label}>{t('caddie.risk.club_label')}</Text>
      <View style={styles.chipRow}>
        {clubs.map((club) => {
          const active = club === selectedClub;
          return (
            <Pressable
              key={club}
              accessibilityRole="button"
              onPress={() => setSelectedClub(club)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{club}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('caddie.risk.intent_label')}</Text>
      <View style={styles.chipRow}>
        {INTENTS.map((value) => {
          const active = value === intent;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setIntent(value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{intentLabel(value)}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={styles.inlineRow}>
          <ActivityIndicator />
          <Text style={styles.bodyText}>{t('caddie.risk.loading')}</Text>
        </View>
      )}
      {error && !loading && <Text style={styles.error}>{error}</Text>}

      {summary && !loading ? (
        <View>
          <Text style={styles.bodyText} testID="caddie-risk-core">
            {t('caddie.risk.core_window', {
              intent: intentLabel(intent),
              carryMin: formatMeters(summary.coreZone.carryMinM),
              carryMax: formatMeters(summary.coreZone.carryMaxM),
              sideMin: formatMeters(summary.coreZone.sideMinM),
              sideMax: formatMeters(summary.coreZone.sideMaxM),
            })}
          </Text>

          {summary.tailLeftProb > 0 ? (
            <Text style={styles.bodyText} testID="caddie-risk-left">
              {t('caddie.risk.tail_left', { percent: Math.round(summary.tailLeftProb * 100) })}
            </Text>
          ) : null}

          {summary.tailRightProb > 0 ? (
            <Text style={styles.bodyText} testID="caddie-risk-right">
              {t('caddie.risk.tail_right', { percent: Math.round(summary.tailRightProb * 100) })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#555',
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipActive: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  chipText: {
    color: '#333',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  bodyText: {
    fontSize: 14,
    marginBottom: 4,
  },
  error: {
    color: '#b00020',
    marginTop: 4,
  },
});

export default CaddieRiskHintsCard;
