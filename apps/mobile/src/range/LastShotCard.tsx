import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RangeShot } from '@app/range/rangeSession';

export function classifyDirection(sideDeg?: number | null): 'left' | 'straight' | 'right' | null {
  if (sideDeg == null || Number.isNaN(sideDeg)) return null;
  if (sideDeg < -3) return 'left';
  if (sideDeg > 3) return 'right';
  return 'straight';
}

interface LastShotCardProps {
  shot: RangeShot | null;
  targetDistanceM?: number | null;
}

export default function LastShotCard({ shot, targetDistanceM }: LastShotCardProps): JSX.Element {
  const direction = classifyDirection(shot?.sideDeg);

  const qualityLabel = useMemo(() => {
    if (!shot?.qualityLevel) return null;
    if (shot.qualityLevel === 'good') return 'Good strike';
    if (shot.qualityLevel === 'warning') return 'OK, but some issues';
    return 'Tracking/strike issue';
  }, [shot?.qualityLevel]);

  if (!shot) {
    return (
      <View style={styles.card} testID="last-shot-placeholder">
        <Text style={styles.cardTitle}>No shots logged yet</Text>
        <Text style={styles.placeholderText}>Hit a shot and tap “Log shot” to see your first result.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="last-shot-card">
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>Last shot</Text>
        {targetDistanceM ? <Text style={styles.badge}>Target {Math.round(targetDistanceM)} m</Text> : null}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Carry</Text>
          <Text style={styles.metricValue}>{shot.carryM != null ? `${Math.round(shot.carryM)} m` : '– m'}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Direction</Text>
          <Text style={styles.metricValue}>{direction ? direction.charAt(0).toUpperCase() + direction.slice(1) : '–'}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Ball speed</Text>
          <Text style={styles.metricValue}>{shot.ballSpeedMps != null ? `${shot.ballSpeedMps.toFixed(1)} m/s` : '–'}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Launch</Text>
          <Text style={styles.metricValue}>{shot.launchDeg != null ? `${shot.launchDeg.toFixed(1)}°` : '–'}</Text>
        </View>
      </View>

      {qualityLabel ? (
        <View style={[styles.badge, styles.qualityBadge]} testID="quality-badge">
          <Text style={styles.badgeText}>{qualityLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  placeholderText: {
    color: '#4B5563',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#EEF2FF',
    color: '#312E81',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  badgeText: {
    color: '#312E81',
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  metricLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  qualityBadge: {
    alignSelf: 'flex-start',
  },
});
