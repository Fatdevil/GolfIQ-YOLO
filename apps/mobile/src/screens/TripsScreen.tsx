import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Trips'>;

export default function TripsScreen(_: Props): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trips & buddies</Text>
      <Text style={styles.subtitle}>Coming soon — plan golf trips and invite friends.</Text>
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
});
