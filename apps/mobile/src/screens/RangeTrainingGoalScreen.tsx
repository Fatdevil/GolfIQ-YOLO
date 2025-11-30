import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import {
  clearCurrentTrainingGoal,
  loadCurrentTrainingGoal,
  saveCurrentTrainingGoal,
} from '@app/range/rangeTrainingGoalStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeTrainingGoal'>;

type GoalTextInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  textAlignVertical?: string;
  testID?: string;
  maxLength?: number;
  multiline?: boolean;
  style?: object;
};

const GoalTextInput: React.FC<GoalTextInputProps> = (props) => <TextInput {...(props as any)} />;

export default function RangeTrainingGoalScreen({ navigation }: Props): JSX.Element {
  const [text, setText] = useState('');
  const [hasExistingGoal, setHasExistingGoal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await loadCurrentTrainingGoal();
      if (!cancelled) {
        setText(existing?.text ?? '');
        setHasExistingGoal(Boolean(existing?.text));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const characterCount = useMemo(() => `${text.trim().length}/120`, [text]);

  const handleSave = async () => {
    await saveCurrentTrainingGoal(text);
    navigation.goBack();
  };

  const handleClear = async () => {
    await clearCurrentTrainingGoal();
    setText('');
    setHasExistingGoal(false);
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('range.trainingGoal.screen_title')}</Text>
      <Text style={styles.subtitle}>{t('range.trainingGoal.screen_description')}</Text>

      <View style={styles.inputCard}>
        <GoalTextInput
          multiline
          maxLength={120}
          value={text}
          onChangeText={setText}
          placeholder={t('range.trainingGoal.placeholder')}
          style={styles.input}
          textAlignVertical="top"
          testID="training-goal-input"
        />
        <Text style={styles.counter}>{characterCount}</Text>
      </View>

      <TouchableOpacity onPress={handleSave} style={styles.primaryButton} testID="save-training-goal">
        <Text style={styles.primaryButtonText}>{t('range.trainingGoal.save_button')}</Text>
      </TouchableOpacity>

      {hasExistingGoal ? (
        <TouchableOpacity onPress={handleClear} style={styles.clearButton} testID="clear-training-goal">
          <Text style={styles.clearButtonText}>{t('range.trainingGoal.clear_button')}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    color: '#4B5563',
  },
  inputCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  input: {
    minHeight: 120,
    fontSize: 16,
  },
  counter: {
    alignSelf: 'flex-end',
    color: '#6B7280',
    fontSize: 12,
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
  clearButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
