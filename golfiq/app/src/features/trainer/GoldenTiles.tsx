import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { GoldenDrillTile, GoldenMetric, GoldenMetricKey } from '../../../../shared/trainer/types';

type GoldenTilesProps =
  | {
      metrics: GoldenMetric[];
      tiles?: undefined;
      onRecordDrill?: undefined;
    }
  | {
      metrics?: undefined;
      tiles: GoldenDrillTile[];
      onRecordDrill?: (tile: GoldenDrillTile, drill: string) => void;
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

function formatDrillValue(value: number | null, tile: GoldenDrillTile): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const val = Number(value);
  switch (tile.key) {
    case 'faceToPathIdx':
      return val.toFixed(2);
    case 'tempo':
      return val.toFixed(2);
    default:
      return Math.abs(val) >= 10 ? val.toFixed(1) : val.toFixed(2);
  }
}

function formatDelta(tile: GoldenDrillTile): string {
  if (tile.delta == null || !Number.isFinite(tile.delta)) {
    return '0';
  }
  const val = Number(tile.delta);
  const formatted = formatDrillValue(val, tile);
  if (val > 0) {
    return `+${formatted}`;
  }
  return formatted;
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

const GoldenTiles: React.FC<GoldenTilesProps> = ({ metrics, tiles, onRecordDrill }) => {
  const [activeKey, setActiveKey] = useState<GoldenMetricKey | null>(null);

  const showDrillTiles = Array.isArray(tiles) && tiles.length > 0;

  const drillTiles = useMemo(() => (showDrillTiles ? tiles.slice() : []), [showDrillTiles, tiles]);

  const orderedDrillTiles = useMemo(() => {
    if (!showDrillTiles) {
      return [];
    }
    return drillTiles.slice().sort((a, b) => a.label.localeCompare(b.label));
  }, [drillTiles, showDrillTiles]);

  if (showDrillTiles) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.drillGrid}>
          {orderedDrillTiles.map((tile) => {
            const delta = tile.delta ?? 0;
            const deltaLabel = formatDelta(tile);
            const deltaStyle = delta > 0.0001 ? styles.drillDeltaPositive : delta < -0.0001 ? styles.drillDeltaNegative : styles.drillDeltaNeutral;
            return (
              <View key={tile.key} style={[styles.drillTile, { borderColor: QUALITY_COLORS[tile.quality] }]}>
                <View style={styles.drillHeader}>
                  <Text style={styles.drillLabel}>{tile.label}</Text>
                  <View style={[styles.qualityDot, { backgroundColor: QUALITY_COLORS[tile.quality] }]} />
                </View>
                <Text style={styles.drillToday}>
                  Today: {formatDrillValue(tile.today, tile)}
                  {tile.unit ? <Text style={styles.drillUnit}> {tile.unit}</Text> : null}
                </Text>
                <Text style={styles.drillMeta}>
                  EMA ({Math.max(0, Math.round(tile.samples))} swings): {formatDrillValue(tile.ema, tile)}
                  {tile.unit ? <Text style={styles.drillUnit}> {tile.unit}</Text> : null}
                </Text>
                <Text style={[styles.drillDelta, deltaStyle]}>
                  Δ {deltaLabel}
                  {tile.unit ? <Text style={styles.drillUnit}> {tile.unit}</Text> : null}
                </Text>
                {tile.target ? (
                  <Text style={styles.drillTarget}>
                    Target: {formatDrillValue(tile.target.min, tile)} – {formatDrillValue(tile.target.max, tile)}
                    {tile.unit ? <Text style={styles.drillUnit}> {tile.unit}</Text> : null}
                  </Text>
                ) : null}
                {tile.quickDrills.length ? (
                  <View style={styles.quickDrillList}>
                    {tile.quickDrills.map((label) => (
                      <TouchableOpacity
                        key={`${tile.key}-${label}`}
                        style={styles.quickDrillChip}
                        onPress={() => onRecordDrill?.(tile, label)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.quickDrillText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    );
  }

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
  drillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  drillTile: {
    flexBasis: '48%',
    minWidth: 160,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: '#0b1120',
    gap: 6,
  },
  drillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drillLabel: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  drillToday: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  drillMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  drillDelta: {
    fontSize: 14,
    fontWeight: '600',
  },
  drillDeltaPositive: {
    color: '#22c55e',
  },
  drillDeltaNegative: {
    color: '#ef4444',
  },
  drillDeltaNeutral: {
    color: '#e2e8f0',
  },
  drillTarget: {
    color: '#94a3b8',
    fontSize: 12,
  },
  drillUnit: {
    color: '#64748b',
    fontSize: 11,
  },
  quickDrillList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickDrillChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#111827',
  },
  quickDrillText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default GoldenTiles;
