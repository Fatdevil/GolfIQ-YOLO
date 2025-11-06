import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  ADVANCE_DWELL_MS,
  ADVANCE_VOTES,
  advanceToHole,
  type AutoHoleState,
} from '../../../../shared/arhud/auto_hole_detect';
import {
  emitAutoHoleStatus,
  type TelemetryEmitter,
} from '../../../../shared/telemetry/arhud';

type AutoHoleChipProps = {
  state: AutoHoleState | null;
  enabled: boolean;
  tournamentSafe: boolean;
  telemetryEmitter?: TelemetryEmitter | null;
  onToggle(enabled: boolean): void;
  onStateChange?(next: AutoHoleState): void;
};

const CONFIDENCE_THRESHOLD = 0.8;
const TELEMETRY_STATUS_INTERVAL_MS = 5_000;

const AutoHoleChip: React.FC<AutoHoleChipProps> = ({
  state,
  enabled,
  tournamentSafe,
  telemetryEmitter,
  onToggle,
  onStateChange,
}) => {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!telemetryEmitter || !state) {
      return undefined;
    }
    const publish = () => {
      emitAutoHoleStatus(telemetryEmitter, {
        courseId: state.courseId,
        hole: state.hole,
        confidence: state.confidence ?? 0,
        teeLead: state.teeLeadHole ?? null,
        votes: state.teeLeadVotes ?? 0,
        auto: enabled,
      });
    };
    publish();
    const interval = setInterval(publish, TELEMETRY_STATUS_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [enabled, state, telemetryEmitter]);

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

  const teeLeadVotes = state?.teeLeadVotes ?? 0;
  const dwellRemainingMs = useMemo(() => {
    if (!state?.lastSwitchAt) {
      return 0;
    }
    return Math.max(0, ADVANCE_DWELL_MS - (now - state.lastSwitchAt));
  }, [now, state?.lastSwitchAt]);

  const holes = state?.holes ?? [];
  const currentIndex = state ? holes.indexOf(state.hole) : -1;
  const canPrev = Boolean(!tournamentSafe && state && onStateChange && currentIndex > 0);
  const canNext = Boolean(
    !tournamentSafe &&
      state &&
      onStateChange &&
      currentIndex >= 0 &&
      currentIndex + 1 < holes.length,
  );
  const prevHoleId = state?.prevHole ?? state?.previousHole ?? null;
  const canUndo = Boolean(!tournamentSafe && state && onStateChange && prevHoleId !== null);

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

  const handlePrev = useCallback(() => {
    if (!state || !onStateChange || !canPrev) {
      return;
    }
    const target = holes[currentIndex - 1];
    if (typeof target !== 'number') {
      return;
    }
    const nextState = advanceToHole(state, target, Date.now(), 'manual', telemetryEmitter);
    onStateChange(nextState);
  }, [canPrev, currentIndex, holes, onStateChange, state, telemetryEmitter]);

  const handleNext = useCallback(() => {
    if (!state || !onStateChange || !canNext) {
      return;
    }
    const target = holes[currentIndex + 1];
    if (typeof target !== 'number') {
      return;
    }
    const nextState = advanceToHole(state, target, Date.now(), 'manual', telemetryEmitter);
    onStateChange(nextState);
  }, [canNext, currentIndex, holes, onStateChange, state, telemetryEmitter]);

  const handleUndo = useCallback(() => {
    if (!state || !onStateChange || !canUndo || prevHoleId === null) {
      return;
    }
    const nextState = advanceToHole(state, prevHoleId, Date.now(), 'undo', telemetryEmitter);
    onStateChange(nextState);
  }, [canUndo, onStateChange, prevHoleId, state, telemetryEmitter]);

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
                onPress={handlePrev}
                disabled={!canPrev}
                style={[styles.actionButton, !canPrev && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Prev</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUndo}
                disabled={!canUndo}
                style={[styles.actionButton, !canUndo && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNext}
                disabled={!canNext}
                style={[styles.actionButton, !canNext && styles.actionButtonDisabled]}
              >
                <Text style={styles.actionLabel}>Next</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.meta}>
              <Text style={styles.metaText}>
                Confidence: {confidencePct !== null ? `${confidencePct}%` : '—'}
              </Text>
              <Text style={styles.metaText}>
                Tee lead votes: {teeLeadVotes} / {ADVANCE_VOTES}
              </Text>
              <Text style={styles.metaText}>
                Auto dwell: {dwellRemainingMs > 0 ? `${Math.ceil(dwellRemainingMs / 1000)}s remaining` : 'Ready'}
              </Text>
              <Text style={styles.metaText}>
                Active since: {state ? new Date(state.sinceTs).toLocaleTimeString() : '—'}
              </Text>
              <Text style={styles.metaText}>
                Last switch: {state?.lastSwitch ? `${state.lastSwitch.reason} → ${state.lastSwitch.to}` : '—'}
              </Text>
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
