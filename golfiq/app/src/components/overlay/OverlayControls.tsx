import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

type OverlayControlsProps = {
  enabled: boolean;
  showCorridor: boolean;
  showRing: boolean;
  showLabels: boolean;
  labelsAvailable: boolean;
  onToggleEnabled: (value: boolean) => void;
  onToggleCorridor: (value: boolean) => void;
  onToggleRing: (value: boolean) => void;
  onToggleLabels: (value: boolean) => void;
};

export default function OverlayControls({
  enabled,
  showCorridor,
  showRing,
  showLabels,
  labelsAvailable,
  onToggleEnabled,
  onToggleCorridor,
  onToggleRing,
  onToggleLabels,
}: OverlayControlsProps): JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View>
          <Text style={styles.title}>Vector Overlay</Text>
          <Text style={styles.caption}>Aim assist preview</Text>
        </View>
        <Switch value={enabled} onValueChange={onToggleEnabled} />
      </View>
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.label}>Aim Corridor</Text>
        <Switch value={showCorridor} onValueChange={onToggleCorridor} disabled={!enabled} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Landing Ring</Text>
        <Switch value={showRing} onValueChange={onToggleRing} disabled={!enabled} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, !labelsAvailable && styles.disabledLabel]}>Labels</Text>
        <Switch
          value={showLabels}
          onValueChange={onToggleLabels}
          disabled={!enabled || !labelsAvailable}
        />
      </View>
      {!labelsAvailable ? <Text style={styles.helper}>Labels unlock after round completion.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  caption: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    color: '#cbd5f5',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledLabel: {
    color: '#475569',
  },
  helper: {
    color: '#64748b',
    fontSize: 11,
  },
});
