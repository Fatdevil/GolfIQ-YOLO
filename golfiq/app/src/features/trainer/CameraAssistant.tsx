import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

type Quality = 'good' | 'ok' | 'poor';

type Size = {
  width: number;
  height: number;
};

type LevelStatus = {
  quality: Quality;
  rollDeg: number;
  label: string;
  detail: string;
};

type FramingStatus = {
  quality: Quality;
  label: string;
  detail: string;
};

type CameraAssistantProps = {
  club?: string;
  distanceMeters?: number;
  previewSize?: Size | null;
  onScoreChange?: (score: Quality, detail: { level: LevelStatus; framing: FramingStatus }) => void;
  style?: ViewStyle;
};

type DeviceMotionLike = {
  rotation?: { alpha?: number; beta?: number; gamma?: number };
};

function toDegrees(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return 0;
  }
  return Number(value) * (180 / Math.PI);
}

function resolveClubKey(club?: string): string {
  if (!club) {
    return '';
  }
  return club.trim().toLowerCase();
}

function resolveClubFamily(club?: string): 'wood' | 'mid' | 'wedge' {
  const key = resolveClubKey(club);
  if (!key) {
    return 'mid';
  }
  if (key.includes('driver') || key.includes('wood') || /^\d+w$/.test(key) || key.endsWith('dr')) {
    return 'wood';
  }
  if (key.includes('wedge') || /[pgls]w$/.test(key)) {
    return 'wedge';
  }
  return 'mid';
}

function framingRange(club?: string): { min: number; max: number } {
  switch (resolveClubFamily(club)) {
    case 'wood':
      return { min: 4.2, max: 6 };
    case 'wedge':
      return { min: 2.2, max: 3.4 };
    case 'mid':
    default:
      return { min: 3, max: 4.2 };
  }
}

function evaluateLevel(rollDeg: number): LevelStatus {
  const abs = Math.abs(rollDeg);
  if (abs <= 2) {
    return {
      quality: 'good',
      rollDeg,
      label: 'Level ✓',
      detail: `${rollDeg.toFixed(1)}° roll`,
    };
  }
  if (abs <= 5) {
    return {
      quality: 'ok',
      rollDeg,
      label: rollDeg > 0 ? 'Tilt R' : 'Tilt L',
      detail: `${rollDeg.toFixed(1)}° roll`,
    };
  }
  return {
    quality: 'poor',
    rollDeg,
    label: rollDeg > 0 ? 'Tilt R' : 'Tilt L',
    detail: `${rollDeg.toFixed(1)}° roll`,
  };
}

function evaluateFraming(
  club: string | undefined,
  distanceMeters: number | undefined,
  previewSize: Size | null | undefined,
): FramingStatus {
  if (!Number.isFinite(distanceMeters ?? Number.NaN)) {
    return {
      quality: 'ok',
      label: 'Framing',
      detail: 'Set tripod ~3m back',
    };
  }
  const distance = Number(distanceMeters);
  const { min, max } = framingRange(club);
  let label = 'Framing ok';
  let detail = `${distance.toFixed(1)} m`; 
  let quality: Quality = 'good';

  if (distance < min - 0.5) {
    quality = 'poor';
    label = 'Step back 1–2m';
  } else if (distance < min) {
    quality = 'ok';
    label = 'Step back';
  } else if (distance > max + 0.5) {
    quality = 'poor';
    label = 'Move closer';
  } else if (distance > max) {
    quality = 'ok';
    label = 'Closer a bit';
  }

  if (previewSize && previewSize.height < previewSize.width) {
    // Landscape orientation usually crops vertical swing; flag as warning.
    if (quality === 'good') {
      quality = 'ok';
    }
    detail = `${detail} · rotate to portrait`;
  }

  return { quality, label, detail };
}

export function getAssistantScore(input: { level: Quality; framing: Quality }): Quality {
  if (input.level === 'poor' || input.framing === 'poor') {
    return 'poor';
  }
  if (input.level === 'ok' || input.framing === 'ok') {
    return 'ok';
  }
  return 'good';
}

const DEFAULT_PREVIEW: Size = { width: 720, height: 1280 };

const CameraAssistant: React.FC<CameraAssistantProps> = ({
  club,
  distanceMeters,
  previewSize,
  onScoreChange,
  style,
}) => {
  const [motion, setMotion] = useState<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });

  useEffect(() => {
    let mounted = true;
    const subscription = DeviceMotion.addListener((event: DeviceMotionLike) => {
      if (!mounted) {
        return;
      }
      const roll = toDegrees(event.rotation?.gamma);
      const pitch = toDegrees(event.rotation?.beta);
      setMotion({ roll, pitch });
    });
    DeviceMotion.setUpdateInterval(250);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  const levelStatus = useMemo(() => evaluateLevel(motion.roll), [motion.roll]);
  const framingStatus = useMemo(
    () => evaluateFraming(club, distanceMeters, previewSize ?? DEFAULT_PREVIEW),
    [club, distanceMeters, previewSize],
  );

  const score = useMemo(
    () => getAssistantScore({ level: levelStatus.quality, framing: framingStatus.quality }),
    [levelStatus.quality, framingStatus.quality],
  );

  useEffect(() => {
    if (typeof onScoreChange === 'function') {
      onScoreChange(score, { level: levelStatus, framing: framingStatus });
    }
  }, [score, levelStatus, framingStatus, onScoreChange]);

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.chip, qualityStyle(levelStatus.quality)]}>
        <Text style={styles.chipLabel}>{levelStatus.label}</Text>
        <Text style={styles.chipDetail}>{levelStatus.detail}</Text>
      </View>
      <View style={[styles.chip, qualityStyle(framingStatus.quality)]}>
        <Text style={styles.chipLabel}>{framingStatus.label}</Text>
        <Text style={styles.chipDetail}>{framingStatus.detail}</Text>
      </View>
    </View>
  );
};

function qualityStyle(quality: Quality): ViewStyle {
  switch (quality) {
    case 'good':
      return styles.good;
    case 'ok':
      return styles.ok;
    case 'poor':
      return styles.poor;
    default:
      return styles.ok;
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  chip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  chipLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 13,
  },
  chipDetail: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  good: {
    borderColor: '#22c55e',
  },
  ok: {
    borderColor: '#fbbf24',
  },
  poor: {
    borderColor: '#ef4444',
  },
});

export default CameraAssistant;
