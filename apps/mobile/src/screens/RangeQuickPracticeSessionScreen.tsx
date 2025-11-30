import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { analyzeRangeShot } from '@app/api/range';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeSession, RangeShot } from '@app/range/rangeSession';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSession'>;

function createShot(session: RangeSession, summary?: string | null): RangeShot {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
    createdAt: new Date().toISOString(),
    club: session.club,
    cameraAngle: session.cameraAngle,
    targetDistanceM: session.targetDistanceM,
    analysis: summary ? { summary } : null,
  };
}

export default function RangeQuickPracticeSessionScreen({ navigation, route }: Props): JSX.Element {
  const { session } = route.params!;
  const [shots, setShots] = useState<RangeShot[]>(session.shots);
  const [saving, setSaving] = useState(false);
  const angleLabel = useMemo(
    () => (session.cameraAngle === 'down_the_line' ? 'DTL' : 'Face-on'),
    [session.cameraAngle],
  );

  const handleLogShot = async () => {
    setSaving(true);
    try {
      const analysis = await analyzeRangeShot({
        club: session.club,
        targetDistanceM: session.targetDistanceM,
        cameraAngle: session.cameraAngle,
        framesToken: null,
      });
      setShots((prev) => [...prev, createShot(session, analysis.summary ?? 'Shot logged')]);
    } catch {
      setShots((prev) => [...prev, createShot(session, 'Shot logged')]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick practice</Text>
        <Text style={styles.angleBadge} testID="angle-label">
          Angle: {angleLabel}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {session.cameraAngle === 'down_the_line'
          ? 'Fokus: svingplan och startlinje.'
          : 'Fokus: balans och längdkontroll.'}
      </Text>

      <View style={styles.meta}>
        {session.club && <Text style={styles.metaItem}>Klubba: {session.club}</Text>}
        {typeof session.targetDistanceM === 'number' && (
          <Text style={styles.metaItem}>Mål: {session.targetDistanceM} m</Text>
        )}
      </View>

      <TouchableOpacity
        accessibilityLabel="Log shot"
        onPress={handleLogShot}
        style={styles.primaryButton}
        disabled={saving}
        testID="log-shot"
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Analyserar…' : 'Logga slag'}</Text>
      </TouchableOpacity>

      <View style={styles.shotList}>
        <Text style={styles.sectionTitle}>Dina slag</Text>
        {shots.length === 0 && <Text style={styles.emptyText}>Inga slag loggade ännu.</Text>}
        {shots.map((shot) => (
          <View key={shot.id} style={styles.shotItem}>
            <Text style={styles.shotTitle}>Shot {shot.id.slice(0, 6)}</Text>
            {shot.analysis?.summary && <Text>{shot.analysis.summary}</Text>}
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.secondaryButton} testID="end-session">
        <Text style={styles.secondaryButtonText}>Avsluta</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
  },
  angleBadge: {
    backgroundColor: '#E0F2FE',
    color: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    fontWeight: '700',
  },
  meta: {
    gap: 4,
  },
  metaItem: {
    color: '#111827',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  shotList: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7280',
  },
  shotItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  shotTitle: {
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
});
