import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

export default function RangePracticeScreen({ navigation }: Props): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Range practice</Text>
      <Text style={styles.subtitle}>Värm upp, följ din träning och lås upp fler insikter.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick practice</Text>
        <Text style={styles.cardSubtitle}>
          Hoppa direkt till inspelning på rangen med kamera-guide och enkel shot tracking.
        </Text>
        <TouchableOpacity
          accessibilityLabel="Start quick practice"
          onPress={() => navigation.navigate('RangeQuickPracticeStart')}
          testID="range-quick-practice-cta"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Starta</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#374151',
  },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
