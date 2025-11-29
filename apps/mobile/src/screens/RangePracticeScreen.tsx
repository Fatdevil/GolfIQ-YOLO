import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

export default function RangePracticeScreen(_: Props): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Range practice</Text>
      <Text style={styles.subtitle}>Coming soon — track your range sessions and missions.</Text>
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
