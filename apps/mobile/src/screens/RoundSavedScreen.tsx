import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatter.format(parsed);
}

type Props = NativeStackScreenProps<RootStackParamList, 'RoundSaved'>;

export default function RoundSavedScreen({ route, navigation }: Props): JSX.Element {
  const summary = route.params?.summary;
  if (!summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Round saved</Text>
        <Text style={styles.meta}>Summary unavailable.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('HomeDashboard')} testID="round-saved-home">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to home</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
  const scoreLabel = summary.relativeToPar ?? `${summary.totalStrokes} strokes`;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Round saved</Text>
        <Text style={styles.subtitle}>{summary.courseName}</Text>
        <Text style={styles.meta}>{summary.teeName}</Text>
        <Text style={styles.meta}>
          {summary.holes} holes · {formatDate(summary.finishedAt)}
        </Text>
        <Text style={styles.score}>{scoreLabel}</Text>
        <Text style={styles.meta}>Run ID: {summary.runId}</Text>
        <Text style={styles.description}>
          Detailed Round Story and AI coach breakdown will appear here soon.
        </Text>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('HomeDashboard')} testID="round-saved-home">
        <View style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Back to home</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
    gap: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  meta: {
    color: '#475569',
  },
  score: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16a34a',
  },
  description: {
    color: '#475569',
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

