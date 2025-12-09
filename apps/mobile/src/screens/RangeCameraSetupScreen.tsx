import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeCameraAngle, RangeSession } from '@app/range/rangeSession';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeCameraSetup'>;

type AngleStatus = 'checking' | 'ok' | 'unknown';

function useAngleCheck(cameraAngle: RangeCameraAngle): AngleStatus {
  const [status, setStatus] = useState<AngleStatus>('unknown');

  useEffect(() => {
    setStatus('checking');
    const timeout = setTimeout(() => {
      setStatus('ok');
    }, 800);

    return () => {
      clearTimeout(timeout);
    };
  }, [cameraAngle]);

  return status;
}

function createSession(params: NonNullable<Props['route']['params']>): RangeSession {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
    mode: 'quick',
    startedAt: new Date().toISOString(),
    club: params.club,
    targetDistanceM: params.targetDistanceM,
    cameraAngle: params.cameraAngle,
    shots: [],
  };
}

const angleCopy: Record<RangeCameraAngle, string> = {
  down_the_line: 'Placera mobilen bakom dig, ungefär 3–4 meter bort, riktad genom bollen mot din målflagga.',
  face_on: 'Placera mobilen vid sidan, i höjd med bröstet, vinkelrätt mot mållinjen.',
};

export default function RangeCameraSetupScreen({ navigation, route }: Props): JSX.Element {
  const params: NonNullable<Props['route']['params']> =
    route.params ?? ({ club: null, targetDistanceM: null, cameraAngle: 'down_the_line' } as const);
  const { club, targetDistanceM, cameraAngle, missionId, practiceRecommendation, entrySource } = params;
  const angleStatus = useAngleCheck(cameraAngle);

  const angleLabel = useMemo(
    () => (cameraAngle === 'down_the_line' ? 'Down-the-line' : 'Face-on'),
    [cameraAngle],
  );

  const statusNode = useMemo(() => {
    if (angleStatus === 'checking') {
      return (
        <View style={styles.statusPill} testID="angle-checking">
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.statusText}>Kontrollerar vinkel…</Text>
        </View>
      );
    }
    if (angleStatus === 'ok') {
      return (
        <View style={[styles.statusPill, styles.statusOk]} testID="angle-ok">
          <Text style={styles.statusText}>Angle OK</Text>
        </View>
      );
    }
    return (
      <View style={styles.statusPill} testID="angle-unknown">
        <Text style={styles.statusText}>Ready when you are</Text>
      </View>
    );
  }, [angleStatus]);

  const handleContinue = () => {
    const session = createSession(params);
    navigation.navigate('RangeQuickPracticeSession', {
      session,
      missionId,
      practiceRecommendation,
      entrySource,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setup camera</Text>
      <Text style={styles.subtitle}>{angleCopy[cameraAngle]}</Text>
      <Text style={styles.subtitle}>Vinkel: {angleLabel}</Text>

      <View style={styles.preview}>
        <View style={styles.overlayBox} />
        <View style={styles.overlayHorizon} />
        <Text style={styles.overlayText}>Stå så du hamnar i rutan när du svingar.</Text>
      </View>

      {statusNode}

      <View style={styles.meta}>
        {club && <Text style={styles.metaItem}>Klubba: {club}</Text>}
        {typeof targetDistanceM === 'number' && <Text style={styles.metaItem}>Mål: {targetDistanceM} m</Text>}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.secondaryButton} testID="camera-back">
          <Text style={styles.secondaryButtonText}>Tillbaka</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleContinue}
          style={styles.primaryButton}
          testID="camera-continue"
        >
          <Text style={styles.primaryButtonText}>Fortsätt till träning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  preview: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#111827',
    padding: 16,
    height: 200,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  overlayBox: {
    width: '60%',
    height: '60%',
    borderColor: '#FDE68A',
    borderWidth: 2,
    borderRadius: 12,
  },
  overlayHorizon: {
    position: 'absolute',
    width: '100%',
    height: 2,
    backgroundColor: '#10B981',
    top: '50%',
  },
  overlayText: {
    position: 'absolute',
    bottom: 12,
    color: '#F9FAFB',
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  statusOk: {
    backgroundColor: '#ECFDF3',
  },
  statusText: {
    fontWeight: '600',
  },
  meta: {
    gap: 4,
  },
  metaItem: {
    color: '#111827',
  },
  actions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
});
