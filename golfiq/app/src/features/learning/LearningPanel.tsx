import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import type { StrategyRiskOverrides } from '../../../../../shared/caddie/strategy';
import {
  resolveRiskBiasMultipliers,
  type RiskBiasOverride,
  type RiskProfile,
} from '../../../../../shared/caddie/strategy_profiles';
import type { Suggestion } from '../../../../../shared/learning/types';

const PROFILE_LABELS: Record<RiskProfile, string> = {
  conservative: 'Conservative',
  neutral: 'Neutral',
  aggressive: 'Aggressive',
};

type LearningPanelProps = {
  suggestions: Suggestion[];
  applied: boolean;
  overrides: StrategyRiskOverrides | null;
  onToggleApply(value: boolean): void;
  onReset(profile: RiskProfile, clubId: string): void;
  onClose(): void;
};

const formatMultiplier = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `×${value.toFixed(2)}`;
};

const formatDelta = (value: number): string => {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-4) {
    return 'Δ 0.00';
  }
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(2)}`;
};

const getActiveOverride = (
  overrides: StrategyRiskOverrides | null,
  profile: RiskProfile,
  clubId: string,
): RiskBiasOverride | null => {
  if (!overrides) {
    return null;
  }
  const entry = overrides[profile];
  if (!entry) {
    return null;
  }
  if (entry.byClub && entry.byClub[clubId]) {
    return entry.byClub[clubId] ?? null;
  }
  return entry.default ?? null;
};

export const LearningPanel: React.FC<LearningPanelProps> = ({
  suggestions,
  applied,
  overrides,
  onToggleApply,
  onReset,
  onClose,
}) => {
  const sorted = useMemo(() => {
    return [...suggestions].sort((a, b) => {
      if (a.clubId === b.clubId) {
        return a.profile.localeCompare(b.profile);
      }
      return a.clubId.localeCompare(b.clubId);
    });
  }, [suggestions]);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Caddie Learning</Text>
          <Text style={styles.subtitle}>Preview per-club risk suggestions gathered on-device.</Text>
        </View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" style={styles.closeButton}>
          <Text style={styles.closeLabel}>Close</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleTitle}>Apply to this round</Text>
          <Text style={styles.toggleHint}>
            Temporarily adjust risk multipliers for this QA session. Stored overrides remain unchanged.
          </Text>
        </View>
        <Switch value={applied} onValueChange={onToggleApply} disabled={suggestions.length === 0} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>No learning suggestions yet. Collect more rounds to populate this view.</Text>
        ) : (
          sorted.map((suggestion) => {
            const activeOverride = getActiveOverride(overrides, suggestion.profile, suggestion.clubId);
            const multipliers = resolveRiskBiasMultipliers(suggestion.profile, activeOverride ?? undefined);
            return (
              <View key={`${suggestion.clubId}-${suggestion.profile}`} style={styles.row}>
                <View style={styles.rowHeader}>
                  <Text style={styles.clubLabel}>{suggestion.clubId}</Text>
                  <Text style={styles.profileLabel}>{PROFILE_LABELS[suggestion.profile]}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Hazard</Text>
                    <Text style={styles.metricValue}>{formatMultiplier(multipliers.hazard)}</Text>
                    <Text style={styles.metricDelta}>{formatDelta(suggestion.hazardDelta)}</Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Distance</Text>
                    <Text style={styles.metricValue}>{formatMultiplier(multipliers.distanceReward)}</Text>
                    <Text style={styles.metricDelta}>{formatDelta(suggestion.distanceDelta)}</Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Success</Text>
                    <Text style={styles.metricValue}>{(suggestion.successEma * 100).toFixed(1)}%</Text>
                    <Text style={styles.metricDelta}>Target {(suggestion.target * 100).toFixed(0)}%</Text>
                  </View>
                </View>
                <View style={styles.footerRow}>
                  <Text style={styles.samples}>Samples {suggestion.sampleSize}</Text>
                  <TouchableOpacity
                    onPress={() => onReset(suggestion.profile, suggestion.clubId)}
                    style={styles.resetButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.resetLabel}>Reset to defaults</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#101418',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f2f5f9',
  },
  subtitle: {
    fontSize: 13,
    color: '#a4acb9',
    marginTop: 2,
    maxWidth: 280,
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeLabel: {
    color: '#88b4ff',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toggleTitle: {
    color: '#f2f5f9',
    fontSize: 16,
    fontWeight: '500',
  },
  toggleHint: {
    color: '#7f8794',
    fontSize: 12,
    marginTop: 2,
    maxWidth: 260,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: 8,
  },
  empty: {
    color: '#7f8794',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 32,
  },
  row: {
    backgroundColor: '#161c24',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clubLabel: {
    color: '#f2f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  profileLabel: {
    color: '#a4acb9',
    fontSize: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    color: '#7f8794',
    fontSize: 12,
    marginBottom: 2,
  },
  metricValue: {
    color: '#f2f5f9',
    fontSize: 15,
    fontWeight: '500',
  },
  metricDelta: {
    color: '#88b4ff',
    fontSize: 12,
    marginTop: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  samples: {
    color: '#7f8794',
    fontSize: 12,
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetLabel: {
    color: '#ff8a80',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default LearningPanel;
