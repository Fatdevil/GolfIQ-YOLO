import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  computeHomography,
  createSnapshot,
  getCalibrationHealth,
  saveHomographySnapshot,
  type CalibrationHealth,
  type HomographySnapshot,
  type HomographyComputation,
  type PixelPoint,
} from '../../../../shared/cv/calibration';

type WizardStep = 'pointA' | 'pointB' | 'summary';

type CalibrationWizardProps = {
  visible: boolean;
  onDismiss: () => void;
  onSaved?: (snapshot: HomographySnapshot) => void;
};

type TapTargetProps = {
  label: string;
  point: PixelPoint | null;
  onSelect: (point: PixelPoint) => void;
};

const MIN_DISTANCE_METERS = 0.05;

function parseDistance(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const normalized = value.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

const TapTarget: React.FC<TapTargetProps> = ({ label, point, onSelect }) => {
  const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const handlePress = useCallback(
    (event: Parameters<NonNullable<Pressable['props']['onPress']>>[0]) => {
      const { locationX, locationY } = event.nativeEvent;
      onSelect({ x: locationX, y: locationY });
    },
    [onSelect],
  );

  const handleLayout = useCallback((event: Parameters<NonNullable<View['props']['onLayout']>>[0]) => {
    setLayout({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  }, []);

  return (
    <View style={styles.tapTargetContainer} onLayout={handleLayout}>
      <Pressable style={styles.tapTarget} onPress={handlePress}>
        <Text style={styles.tapHint}>Tap to mark point {label}</Text>
        {layout.width > 0 && layout.height > 0 && point ? (
          <View
            pointerEvents="none"
            style={[
              styles.marker,
              {
                left: Math.max(0, Math.min(layout.width - 24, point.x - 12)),
                top: Math.max(0, Math.min(layout.height - 24, point.y - 12)),
              },
            ]}
          >
            <View style={styles.markerDot} />
            <Text style={styles.markerLabel}>{label}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
};

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue}>{value}</Text>
  </View>
);

const CalibrationWizard: React.FC<CalibrationWizardProps> = ({ visible, onDismiss, onSaved }) => {
  const [step, setStep] = useState<WizardStep>('pointA');
  const [pointA, setPointA] = useState<PixelPoint | null>(null);
  const [pointB, setPointB] = useState<PixelPoint | null>(null);
  const [distanceA, setDistanceA] = useState('');
  const [distanceB, setDistanceB] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computation, setComputation] = useState<HomographyComputation | null>(null);
  const [snapshot, setSnapshot] = useState<HomographySnapshot | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setStep('pointA');
    setPointA(null);
    setPointB(null);
    setDistanceA('');
    setDistanceB('');
    setError(null);
    setComputation(null);
    setSnapshot(null);
  }, [visible]);

  const distanceANumeric = useMemo(() => parseDistance(distanceA), [distanceA]);
  const distanceBNumeric = useMemo(() => parseDistance(distanceB), [distanceB]);

  const nextDisabled = useMemo(() => {
    if (!pointA || distanceANumeric === null) {
      return true;
    }
    return distanceANumeric < MIN_DISTANCE_METERS;
  }, [distanceANumeric, pointA]);

  const computeDisabled = useMemo(() => {
    if (!pointB || distanceBNumeric === null) {
      return true;
    }
    if (!pointA || distanceANumeric === null) {
      return true;
    }
    return Math.abs(distanceBNumeric - distanceANumeric) < MIN_DISTANCE_METERS;
  }, [distanceANumeric, distanceBNumeric, pointA, pointB]);

  const handleNext = useCallback(() => {
    if (!pointA || distanceANumeric === null) {
      setError('Tap the ground and enter distance for point A.');
      return;
    }
    setError(null);
    setStep('pointB');
  }, [distanceANumeric, pointA]);

  const handleCompute = useCallback(async () => {
    if (!pointA || !pointB || distanceANumeric === null || distanceBNumeric === null) {
      setError('Pick two ground points and distances.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = computeHomography(pointA, pointB, distanceANumeric, distanceBNumeric);
      const snapshotResult = createSnapshot(result);
      await saveHomographySnapshot(snapshotResult);
      setComputation(result);
      setSnapshot(snapshotResult);
      setStep('summary');
      if (onSaved) {
        onSaved(snapshotResult);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compute homography.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [distanceANumeric, distanceBNumeric, onSaved, pointA, pointB]);

  const handleRetake = useCallback(() => {
    setStep('pointA');
    setPointA(null);
    setPointB(null);
    setDistanceA('');
    setDistanceB('');
    setComputation(null);
    setSnapshot(null);
    setError(null);
  }, []);

  const health = useMemo<CalibrationHealth>(() => getCalibrationHealth(snapshot ?? computation), [computation, snapshot]);

  const baselineMeters = snapshot?.baselineMeters ?? computation?.baselineMeters ?? 0;
  const angleDeg = snapshot?.baselineAngleDeg ?? computation?.baselineAngleDeg ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Ground calibration</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Text style={styles.closeButtonLabel}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.modalContent}>
          {step === 'pointA' ? (
            <>
              <Text style={styles.stepLabel}>Step 1 of 2</Text>
              <Text style={styles.stepCopy}>Tap a point on the ground and enter how far it is from the phone.</Text>
              <TapTarget label="A" point={pointA} onSelect={setPointA} />
              <TextInput
                value={distanceA}
                onChangeText={setDistanceA}
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="Distance to point A (m)"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                onPress={handleNext}
                disabled={nextDisabled}
                style={[styles.primaryButton, nextDisabled ? styles.primaryButtonDisabled : null]}
              >
                <Text style={styles.primaryButtonLabel}>Next</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {step === 'pointB' ? (
            <>
              <Text style={styles.stepLabel}>Step 2 of 2</Text>
              <Text style={styles.stepCopy}>Pick a second ground point further away and enter the distance.</Text>
              <TapTarget label="B" point={pointB} onSelect={setPointB} />
              <TextInput
                value={distanceB}
                onChangeText={setDistanceB}
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="Distance to point B (m)"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                onPress={handleCompute}
                disabled={computeDisabled || saving}
                style={[
                  styles.primaryButton,
                  computeDisabled || saving ? styles.primaryButtonDisabled : null,
                ]}
              >
                {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.primaryButtonLabel}>Save calibration</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRetake} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Start over</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {step === 'summary' && snapshot ? (
            <>
              <Text style={styles.stepLabel}>Calibration saved</Text>
              <View style={[styles.healthBadge, styles[`health_${health}` as const]]}>
                <Text style={styles.healthBadgeLabel}>Calibration: {health.toUpperCase()}</Text>
              </View>
              <View style={styles.summaryCard}>
                <SummaryRow
                  label="Baseline"
                  value={`${Math.abs(baselineMeters).toFixed(2)} m`}
                />
                <SummaryRow label="Angle" value={`${Math.round(Math.abs(angleDeg))}°`} />
                <SummaryRow
                  label="Captured"
                  value={new Date(snapshot.computedAt).toLocaleString()}
                />
              </View>
              <TouchableOpacity onPress={handleRetake} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDismiss} style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Done</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  closeButtonLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  stepLabel: {
    color: '#cbd5f5',
    fontSize: 14,
    fontWeight: '600',
  },
  stepCopy: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  tapTargetContainer: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0b1120',
  },
  tapTarget: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: {
    color: '#475569',
    fontSize: 13,
  },
  marker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f8fafc',
  },
  markerLabel: {
    position: 'absolute',
    bottom: -18,
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  errorText: {
    marginTop: 8,
    color: '#f87171',
    fontSize: 13,
  },
  healthBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  health_good: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  health_ok: {
    backgroundColor: 'rgba(234,179,8,0.15)',
  },
  health_poor: {
    backgroundColor: 'rgba(248,113,113,0.15)',
  },
  healthBadgeLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  summaryCard: {
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  summaryValue: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default CalibrationWizard;
