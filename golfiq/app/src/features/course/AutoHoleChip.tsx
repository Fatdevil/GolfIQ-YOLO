import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AutoHoleState } from '../../../../shared/arhud/auto_hole_detect';

type AutoHoleChipProps = {
  state: AutoHoleState | null;
  enabled: boolean;
  tournamentSafe: boolean;
  onToggle(enabled: boolean): void;
  onStep(action: 'prev' | 'next' | 'undo'): void;
};

const CONFIDENCE_THRESHOLD = 0.7;

const AutoHoleChip: React.FC<AutoHoleChipProps> = ({ state, enabled, tournamentSafe, onToggle, onStep }) => {
  const [open, setOpen] = useState(false);

  const confidencePct = useMemo(() => {
    if (!state) {
      return null;
    }
    const pct = Math.round((state.confidence ?? 0) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [state]);

  const stable = useMemo(() => (state?.confidence ?? 0) >= CONFIDENCE_THRESHOLD, [state?.confidence]);

  const chipLabel = useMemo(() => {
    if (!state) {
      return 'Auto-hole';
    }
    const prefix = `Hole ${state.hole}`;
    if (!enabled) {
      return `${prefix} • Manual`;
    }
    if (!stable) {
      return `${prefix} • Auto ↻`;
    }
    return `${prefix} • Auto ✓ (${confidencePct ?? 0}%)`;
  }, [confidencePct, enabled, stable, state]);

  const showSheet = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
  }, []);

  const handleToggle = useCallback(
    (value: boolean) => {
      if (tournamentSafe) {
        return;
      }
      onToggle(value);
    },
    [onToggle, tournamentSafe],
  );

  const handleStep = useCallback(
    (action: 'prev' | 'next' | 'undo') => {
      if (tournamentSafe) {
        return;
      }
      onStep(action);
    },
    [onStep, tournamentSafe],
  );

  return (
    <>
      <TouchableOpacity
        onPress={showSheet}
        style={[styles.chip, enabled ? styles.chipEnabled : styles.chipDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Auto hole status"
      >
        <Text style={styles.chipLabel}>{chipLabel}</Text>
      </TouchableOpacity>
      <Modal transparent animationType="fade" visible={open} onRequestClose={closeSheet}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Auto-Hole Detect</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Auto mode</Text>
              <Switch value={enabled} onValueChange={handleToggle} disabled={tournamentSafe} />
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => handleStep('prev')}
                disabled={tournamentSafe}
                style={[styles.actionButton, tournamentSafe && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleStep('undo')}
                disabled={tournamentSafe}
                style={[styles.actionButton, tournamentSafe && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleStep('next')}
                disabled={tournamentSafe}
                style={[styles.actionButton, tournamentSafe && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Next</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.meta}>
              <Text style={styles.metaText}>
                Confidence: {confidencePct !== null ? `${confidencePct}%` : '—'}
              </Text>
              <Text style={styles.metaText}>Active hole since: {state ? new Date(state.sinceTs).toLocaleTimeString() : '—'}</Text>
              <Text style={styles.metaText}>Last reasons: {state?.lastReasons?.join(', ') || '—'}</Text>
              {tournamentSafe ? (
                <Text style={styles.metaWarning}>Tournament-safe: auto-advance disabled</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={closeSheet} style={styles.closeButton}>
              <Text style={styles.closeLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipEnabled: {
    backgroundColor: '#1d4ed8',
  },
  chipDisabled: {
    backgroundColor: '#1f2937',
  },
  chipLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    width: '100%',
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#1d4ed8',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#1f2937',
  },
  actionLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '500',
  },
  meta: {
    gap: 6,
  },
  metaText: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  metaWarning: {
    color: '#facc15',
    fontSize: 13,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  closeLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default AutoHoleChip;

