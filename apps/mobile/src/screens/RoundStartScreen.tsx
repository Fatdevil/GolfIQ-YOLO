import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { startRound } from '@app/api/roundClient';
import type { RootStackParamList } from '@app/navigation/types';
import { saveActiveRoundState } from '@app/round/roundState';

const holesOptions = [9, 18];

export default function RoundStartScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RoundStart'>): JSX.Element {
  const [courseId, setCourseId] = useState('');
  const [teeName, setTeeName] = useState('');
  const [holes, setHoles] = useState(18);
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    setSubmitting(true);
    try {
      const round = await startRound({
        courseId: courseId.trim() || undefined,
        teeName: teeName.trim() || undefined,
        holes,
      });
      await saveActiveRoundState({ round, currentHole: 1 });
      navigation.navigate('RoundShot', { roundId: round.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start round';
      Alert.alert('Start round failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Start a round</Text>
      <TextInput
        style={styles.input}
        placeholder="Course name or id"
        value={courseId}
        onChangeText={setCourseId}
        accessibilityLabel="Course"
      />
      <TextInput
        style={styles.input}
        placeholder="Tee name (optional)"
        value={teeName}
        onChangeText={setTeeName}
        accessibilityLabel="Tee name"
      />
      <View style={styles.toggleRow}>
        {holesOptions.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.toggle, holes === option && styles.toggleActive]}
            onPress={() => setHoles(option)}
            accessibilityLabel={`${option} holes`}
          >
            <Text style={styles.toggleText}>{option} holes</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={handleStart}
        accessibilityLabel="Start round"
        testID="start-round-button"
      >
        <Text style={styles.buttonText}>{submitting ? 'Starting…' : 'Start round'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggle: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
  },
  toggleText: {
    color: '#111',
    fontWeight: '500',
  },
  button: {
    marginTop: 12,
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
