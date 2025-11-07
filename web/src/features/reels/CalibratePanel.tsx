import { useCallback, useMemo, useState, type CSSProperties } from 'react';

import {
  computeHomography,
  computeResiduals,
  qualityScore,
  type Homography,
  type Pt,
} from '@shared/tracer/calibrate';
import { emitTracerCalibration } from '@shared/telemetry/tracer';

type CalibrationResult = {
  homography: Homography;
  yardage_m: number;
  score: number;
};

type Props = {
  width: number;
  height: number;
  holeBearingDeg: number;
  defaultYardage?: number;
  onSave?: (payload: { homography: Homography; tee: Pt; flag: Pt; yardage_m: number; quality: number }) => void;
};

function formatScore(score: number | null): string {
  if (score == null) {
    return '—';
  }
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

export default function CalibratePanel(props: Props): JSX.Element {
  const [tee, setTee] = useState<Pt | null>(null);
  const [flag, setFlag] = useState<Pt | null>(null);
  const [yardage, setYardage] = useState<string>(
    props.defaultYardage != null ? String(Math.round(props.defaultYardage)) : '',
  );
  const [step, setStep] = useState<'tee' | 'flag' | 'review'>(!tee ? 'tee' : !flag ? 'flag' : 'review');

  const yardageNumber = useMemo(() => {
    const parsed = Number(yardage);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [yardage]);

  const calibration = useMemo<CalibrationResult | null>(() => {
    if (!tee || !flag || yardageNumber == null) {
      return null;
    }
    const homography = computeHomography(tee, flag, props.holeBearingDeg, yardageNumber);
    const residuals = computeResiduals([tee, flag], homography);
    const score = qualityScore(residuals);
    return { homography, yardage_m: yardageNumber, score };
  }, [flag, props.holeBearingDeg, tee, yardageNumber]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const point: Pt = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (step === 'tee') {
        setTee(point);
        setStep('flag');
        return;
      }
      if (step === 'flag') {
        setFlag(point);
        setStep('review');
      }
    },
    [step],
  );

  const handleReset = useCallback(() => {
    setTee(null);
    setFlag(null);
    setStep('tee');
  }, []);

  const handleSave = useCallback(() => {
    if (!calibration || !tee || !flag) {
      return;
    }
    emitTracerCalibration({
      quality: calibration.score,
      yardage_m: calibration.yardage_m,
      holeBearingDeg: props.holeBearingDeg,
    });
    props.onSave?.({
      homography: calibration.homography,
      tee,
      flag,
      yardage_m: calibration.yardage_m,
      quality: calibration.score,
    });
  }, [calibration, flag, props, tee]);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Calibrate</h3>
      <p style={styles.subtitle}>
        {step === 'tee'
          ? 'Click the tee location on the preview.'
          : step === 'flag'
          ? 'Click the flagstick.'
          : 'Review calibration before saving.'}
      </p>
      <div
        style={{ ...styles.preview, width: props.width, height: props.height }}
        onClick={handleClick}
        role="presentation"
      >
        {tee ? (
          <div
            style={{
              ...styles.marker,
              ...styles.markerTee,
              transform: `translate(${tee.x - 12}px, ${tee.y - 12}px)`,
            }}
          >
            Tee
          </div>
        ) : null}
        {flag ? (
          <div
            style={{
              ...styles.marker,
              ...styles.markerFlag,
              transform: `translate(${flag.x - 12}px, ${flag.y - 12}px)`,
            }}
          >
            Flag
          </div>
        ) : null}
      </div>
      <label style={styles.field}>
        <span>Yardage (m)</span>
        <input
          type="number"
          value={yardage}
          onChange={(event) => setYardage(event.target.value)}
          placeholder="180"
          style={styles.input}
        />
      </label>
      <div style={styles.metricRow}>
        <span>Quality</span>
        <strong>{formatScore(calibration?.score ?? null)}</strong>
      </div>
      <div style={styles.actions}>
        <button type="button" onClick={handleReset} style={styles.button}>
          Reset
        </button>
        <button
          type="button"
          disabled={!calibration}
          onClick={handleSave}
          style={{
            ...styles.button,
            ...(calibration ? styles.buttonPrimary : styles.buttonDisabled),
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  title: {
    margin: 0,
    color: '#0f172a',
    fontSize: 18,
    fontWeight: 600,
  },
  subtitle: {
    margin: 0,
    color: '#475569',
    fontSize: 14,
  },
  preview: {
    position: 'relative',
    border: '1px solid #cbd5f5',
    borderRadius: 12,
    background: '#0f172a',
    overflow: 'hidden',
    cursor: 'crosshair',
  },
  marker: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 600,
    fontSize: 12,
    pointerEvents: 'none',
  },
  markerTee: {
    backgroundColor: '#0ea5e9aa',
  },
  markerFlag: {
    backgroundColor: '#f97316aa',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    color: '#0f172a',
    fontSize: 14,
  },
  input: {
    borderRadius: 8,
    border: '1px solid #94a3b8',
    padding: '8px 12px',
    fontSize: 14,
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#0f172a',
    fontSize: 14,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #2563eb',
    background: '#fff',
    color: '#2563eb',
    cursor: 'pointer',
    fontWeight: 600,
  },
  buttonPrimary: {
    background: '#1d4ed8',
    color: '#fff',
  },
  buttonDisabled: {
    background: '#e2e8f0',
    color: '#94a3b8',
    borderColor: '#cbd5f5',
    cursor: 'not-allowed',
  },
};
