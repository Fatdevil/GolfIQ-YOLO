import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { GoldenMetric, GoldenMetricKey } from '../../../../shared/trainer/types';

type GoldenTilesProps = {
  metrics: GoldenMetric[];
};

type Cue = {
  title: string;
  body: string;
};

const QUALITY_COLORS: Record<GoldenMetric['quality'], string> = {
  good: '#22c55e',
  ok: '#fbbf24',
  poor: '#ef4444',
};

function formatValue(metric: GoldenMetric): string {
  if (!Number.isFinite(metric.value)) {
    return '—';
  }
  const value = metric.value;
  switch (metric.key) {
    case 'faceToPathIdx':
      return value.toFixed(2);
    case 'tempo':
      return value.toFixed(2);
    default:
      return value.toFixed(Math.abs(value) >= 10 ? 1 : 1);
  }
}

function cueForMetric(metric: GoldenMetric): Cue {
  switch (metric.key) {
    case 'startLine': {
      const direction = metric.value >= 0 ? 'R' : 'L';
      const mag = Math.abs(metric.value).toFixed(1);
      return {
        title: 'Start line',
        body: `Start ${mag}° ${direction} or match aim with a gate.`,
      };
    }
    case 'faceToPathIdx': {
      return {
        title: 'Face to path',
        body: metric.value > 0
          ? 'Feel a softer fade — close the face 1° relative to path.'
          : 'Feel a baby draw — match face 1° past path.',
      };
    }
    case 'tempo': {
      const delta = (metric.value - 3).toFixed(2);
      return {
        title: 'Tempo',
        body: Math.abs(metric.value - 3) < 0.01
          ? 'Keep the 3:1 cadence locked in.'
          : `Adjust cadence by ${delta} to target 3:1. Use metronome counts.`,
      };
    }
    case 'lowPointSign':
      return {
        title: 'Low point',
        body: metric.value <= 0
          ? 'Great strike — keep pressure forward through impact.'
          : 'Shift pressure lead side earlier to move low point ahead.',
      };
    case 'launchProxy':
      return {
        title: 'Launch window',
        body: metric.quality === 'good'
          ? 'Window matched — keep the same setup.'
          : 'Tee height / ball position tweak: chase target launch window.',
      };
    case 'dynLoftProxy':
      return {
        title: 'Dynamic loft',
        body: metric.value >= 0
          ? 'Add shaft lean to de-loft slightly.'
          : 'Maintain loft — avoid excessive handle lean.',
      };
    default:
      return { title: metric.label, body: 'Rehearse the same cue next rep.' };
  }
}

const GoldenTiles: React.FC<GoldenTilesProps> = ({ metrics }) => {
  const [activeKey, setActiveKey] = useState<GoldenMetricKey | null>(null);

  const cue = useMemo(() => {
    if (!activeKey) {
      return null;
    }
    const metric = metrics.find((entry) => entry.key === activeKey);
    return metric ? cueForMetric(metric) : null;
  }, [activeKey, metrics]);

  const ordered = useMemo(
    () => metrics.slice().sort((a, b) => a.label.localeCompare(b.label)),
    [metrics],
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.grid}>
        {ordered.map((metric) => (
          <TouchableOpacity
            key={metric.key}
            style={[styles.tile, { borderColor: QUALITY_COLORS[metric.quality] }]}
            onPress={() => setActiveKey((prev) => (prev === metric.key ? null : metric.key))}
            accessibilityRole="button"
          >
            <Text style={styles.label}>{metric.label}</Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{formatValue(metric)}</Text>
              {metric.unit ? <Text style={styles.unit}>{metric.unit}</Text> : null}
            </View>
            <View style={[styles.qualityDot, { backgroundColor: QUALITY_COLORS[metric.quality] }]} />
          </TouchableOpacity>
        ))}
      </View>
      {cue ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>Next rep cue</Text>
          <Text style={styles.tooltipLabel}>{cue.title}</Text>
          <Text style={styles.tooltipBody}>{cue.body}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '30%',
    minWidth: 110,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#0b1120',
  },
  label: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  unit: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 2,
  },
  qualityDot: {
    marginTop: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltip: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  tooltipTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tooltipLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  tooltipBody: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
});

export default GoldenTiles;
