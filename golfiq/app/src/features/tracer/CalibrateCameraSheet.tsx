import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { computeHomography, computeResiduals, qualityScore } from '@shared/tracer/calibrate';
import type { Homography, Pt } from '@shared/tracer/calibrate';
import { setTracerCalibration } from '@shared/round/round_store';
import { emitTracerCalibration } from '@shared/telemetry/tracer';
import type { TracerCalibration } from '@shared/tracer/types';

type CalibrationState = {
  tee: Pt | null;
  flag: Pt | null;
  yardage: string;
};

type CalibrationResult = {
  homography: Homography;
  residuals: number[];
  score: number;
  yardage_m: number;
};

type CalibrateCameraSheetProps = {
  width: number;
  height: number;
  holeBearingDeg: number;
  defaultYardage?: number;
  onClose?: () => void;
  onSave?: (payload: { homography: Homography; tee: Pt; flag: Pt; yardage_m: number; quality: number }) => void;
};

function formatScore(score: number): string {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  if (pct >= 90) {
    return `Great · ${pct.toFixed(0)}%`;
  }
  if (pct >= 70) {
    return `Good · ${pct.toFixed(0)}%`;
  }
  if (pct >= 40) {
    return `Ok · ${pct.toFixed(0)}%`;
  }
  if (pct > 0) {
    return `Poor · ${pct.toFixed(0)}%`;
  }
  return 'Unknown';
}

function resolvePoint(event: { nativeEvent: { locationX: number; locationY: number } }): Pt {
  return {
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  };
}

export default function CalibrateCameraSheet(props: CalibrateCameraSheetProps): JSX.Element {
  const [state, setState] = useState<CalibrationState>({
    tee: null,
    flag: null,
    yardage: props.defaultYardage ? String(Math.round(props.defaultYardage)) : '',
  });
  const [step, setStep] = useState<'tee' | 'flag' | 'review'>(state.tee ? (state.flag ? 'review' : 'flag') : 'tee');

  const yardageNumber = useMemo(() => {
    const parsed = Number(state.yardage);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [state.yardage]);

  const calibration = useMemo<CalibrationResult | null>(() => {
    if (!state.tee || !state.flag || yardageNumber == null) {
      return null;
    }
    const homography = computeHomography(state.tee, state.flag, props.holeBearingDeg, yardageNumber);
    const residuals = computeResiduals([state.tee, state.flag], homography);
    const score = qualityScore(residuals);
    return { homography, residuals, score, yardage_m: yardageNumber };
  }, [props.holeBearingDeg, state.flag, state.tee, yardageNumber]);

  const handleTap = useCallback(
    (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      const point = resolvePoint(event);
      setState((prev) => {
        if (step === 'tee') {
          return { ...prev, tee: point };
        }
        if (step === 'flag') {
          return { ...prev, flag: point };
        }
        return prev;
      });
      setStep((prev) => {
        if (prev === 'tee') {
          return 'flag';
        }
        if (prev === 'flag') {
          return 'review';
        }
        return prev;
      });
    },
    [step],
  );

  const handleReset = useCallback(() => {
    setState((prev) => ({ ...prev, tee: null, flag: null }));
    setStep('tee');
  }, []);

  const handleSave = useCallback(() => {
    if (!calibration || !state.tee || !state.flag) {
      return;
    }
    const snapshot: TracerCalibration = {
      H: calibration.homography.matrix,
      yardage_m: calibration.yardage_m,
      quality: calibration.score,
      createdAt: Date.now(),
    };
    emitTracerCalibration({
      quality: calibration.score,
      yardage_m: calibration.yardage_m,
      holeBearingDeg: props.holeBearingDeg,
    });
    setTracerCalibration(snapshot);
    if (props.onSave) {
      props.onSave({
        homography: calibration.homography,
        tee: state.tee,
        flag: state.flag,
        yardage_m: calibration.yardage_m,
        quality: calibration.score,
      });
    }
    if (props.onClose) {
      props.onClose();
    }
  }, [calibration, props, state.flag, state.tee]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calibrate camera</Text>
      <Text style={styles.subtitle}>
        {step === 'tee' ? 'Tap the tee on the preview.' : step === 'flag' ? 'Tap the flagstick.' : 'Review & save calibration.'}
      </Text>
      <Pressable style={[styles.preview, { width: props.width, height: props.height }]} onPress={handleTap}>
        {state.tee ? (
          <View style={[styles.marker, styles.teeMarker, { left: state.tee.x - 12, top: state.tee.y - 12 }]}> 
            <Text style={styles.markerLabel}>Tee</Text>
          </View>
        ) : null}
        {state.flag ? (
          <View style={[styles.marker, styles.flagMarker, { left: state.flag.x - 12, top: state.flag.y - 12 }]}> 
            <Text style={styles.markerLabel}>Flag</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Yardage (m)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={state.yardage}
          placeholder="180"
          onChangeText={(text) => setState((prev) => ({ ...prev, yardage: text }))}
        />
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Quality</Text>
        <Text style={styles.metricValue}>{calibration ? formatScore(calibration.score) : '—'}</Text>
      </View>
      <View style={styles.actions}>
        <Text style={styles.actionButton} onPress={handleReset}>
          Reset
        </Text>
        <Text style={[styles.actionButton, calibration ? styles.actionPrimary : styles.actionDisabled]} onPress={handleSave}>
          Save
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  preview: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teeMarker: {
    backgroundColor: '#0ea5e9aa',
  },
  flagMarker: {
    backgroundColor: '#f97316aa',
  },
  markerLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  input: {
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#fff',
    fontSize: 16,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  actionButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  actionPrimary: {
    color: '#1d4ed8',
  },
  actionDisabled: {
    color: '#94a3b8',
  },
});
