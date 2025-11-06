import React, { useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AutoHoleState } from '../../../../../shared/arhud/auto_hole_detect';

type AutoHoleChipProps = {
  state: AutoHoleState | null;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onUndo: () => void;
  tournamentSafe?: boolean;
};

const CONF_THRESHOLD = 0.65;

const AutoHoleChip: React.FC<AutoHoleChipProps> = ({
  state,
  enabled,
  onToggle,
  onPrev,
  onNext,
  onUndo,
  tournamentSafe,
}) => {
  const [visible, setVisible] = useState(false);

  const confidencePct = useMemo(() => {
    if (!state) {
      return 0;
    }
    return Math.round(Math.max(0, Math.min(1, state.confidence ?? 0)) * 100);
  }, [state?.confidence]);

  const chipLabel = useMemo(() => {
    if (!state) {
      return 'Auto hole —';
    }
    if (!enabled) {
      return `Hole ${state.hole} · Auto ⏸`;
    }
    const suffix = confidencePct >= CONF_THRESHOLD * 100 ? '✓' : '↻';
    return `Hole ${state.hole} · Auto ${suffix}`;
  }, [confidencePct, enabled, state]);

  const chipDetail = useMemo(() => {
    if (!state || !enabled) {
      return null;
    }
    return `${confidencePct}%`;
  }, [confidencePct, enabled, state]);

  const reasons = state?.reasons ?? [];

  const controlsDisabled = Boolean(tournamentSafe);

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} style={styles.chip}>
        <Text style={styles.chipLabel}>{chipLabel}</Text>
        {chipDetail ? <Text style={styles.chipDetail}>{chipDetail}</Text> : null}
      </TouchableOpacity>
      <Modal transparent visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Auto-hole detection</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeLabel}>Close</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Auto-hole</Text>
              <Switch
                value={enabled}
                onValueChange={controlsDisabled ? undefined : onToggle}
                disabled={controlsDisabled}
                thumbColor={enabled ? '#22c55e' : '#e2e8f0'}
                trackColor={{ true: '#4ade80', false: '#334155' }}
              />
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={onPrev}
                disabled={controlsDisabled}
                style={[styles.sheetButton, controlsDisabled ? styles.sheetButtonDisabled : null]}
              >
                <Text style={styles.sheetButtonLabel}>Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onUndo}
                disabled={controlsDisabled || !state?.previousHole}
                style={[styles.sheetButton, controlsDisabled ? styles.sheetButtonDisabled : null]}
              >
                <Text style={styles.sheetButtonLabel}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onNext}
                disabled={controlsDisabled}
                style={[styles.sheetButton, controlsDisabled ? styles.sheetButtonDisabled : null]}
              >
                <Text style={styles.sheetButtonLabel}>Next</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statusBlock}>
              <Text style={styles.statusHeadline}>
                {state ? `Hole ${state.hole}` : 'No hole detected'}
              </Text>
              <Text style={styles.statusMeta}>
                {enabled ? `Confidence ${confidencePct}%` : 'Auto disabled'}
              </Text>
              {reasons.length ? (
                <Text style={styles.statusMeta}>Reasons: {reasons.join(', ')}</Text>
              ) : null}
              {state?.nextTeeVotes ? (
                <Text style={styles.statusMeta}>
                  Next tee votes: {state.nextTeeVotes}
                  {state.nextTeeIsClosest ? ' • closest tee' : ''}
                </Text>
              ) : null}
            </View>
            {tournamentSafe ? (
              <Text style={styles.notice}>Tournament-safe: auto advance disabled</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chipLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  chipDetail: {
    color: '#94a3b8',
    fontSize: 12,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  closeLabel: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    color: '#cbd5f5',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
  },
  sheetButtonDisabled: {
    backgroundColor: '#1e293b',
  },
  sheetButtonLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500',
  },
  statusBlock: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  statusHeadline: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  statusMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  notice: {
    color: '#fbbf24',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default AutoHoleChip;
