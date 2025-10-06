import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
} from 'react-native';

import { submitFeedback, FeedbackCategory } from '../lib/api';
import { useQaSummary } from '../context/QaSummaryContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'ui', label: 'UI' },
  { value: 'accuracy', label: 'Accuracy' },
];

const RATE_LIMIT_WINDOW_MS = 60_000;

export default function FeedbackModal({ visible, onClose }: Props) {
  const { qaSummary } = useQaSummary();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lastSubmittedRef = useRef<number>(0);

  const canSubmit = message.trim().length >= 5 && !submitting;

  const deviceInfo = useMemo(() => {
    const metrics = qaSummary?.metrics as (Record<string, unknown> & { tier?: unknown }) | null;
    const tierCandidate = metrics && typeof metrics.tier === 'string' ? (metrics.tier as string) : undefined;

    return {
      platform: Platform.OS,
      version: typeof Platform.Version === 'string' ? Platform.Version : String(Platform.Version ?? ''),
      tier: tierCandidate || 'unknown',
    };
  }, [qaSummary?.metrics]);

  const qaAttachment = useMemo(() => {
    if (!qaSummary) return undefined;
    const { quality, metrics, notes, capturedAt } = qaSummary;
    return {
      quality: quality ?? null,
      notes: notes ?? null,
      capturedAt,
      metrics: metrics ?? null,
    };
  }, [qaSummary]);

  const resetForm = () => {
    setMessage('');
    setCategory('bug');
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    const now = Date.now();
    if (now - lastSubmittedRef.current < RATE_LIMIT_WINDOW_MS) {
      Alert.alert('Hold on', 'Please wait a minute before sending another report.');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({
        category,
        message: message.trim(),
        qaSummary: qaAttachment,
        device: deviceInfo,
      });
      lastSubmittedRef.current = now;
      Alert.alert('Thank you', 'Your feedback has been sent.');
      resetForm();
      onClose();
    } catch (err) {
      console.error('Failed to submit feedback', err);
      Alert.alert('Error', 'Could not send feedback right now. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Send feedback</Text>
          <Text style={styles.subtitle}>
            Spot a bug or have accuracy notes? Share a short description below.
          </Text>

          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.row}>
              {CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => setCategory(item.value)}
                  style={[styles.pill, category === item.value && styles.pillActive]}
                >
                  <Text style={[styles.pillText, category === item.value && styles.pillTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>What happened?</Text>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              placeholder="Short description (no personal data)"
              placeholderTextColor="#9aa3b2"
              editable={!submitting}
            />
          </View>

          <Text style={styles.meta}>
            Recent QA snapshot and device tier are attached automatically.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity onPress={handleClose} disabled={submitting} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmit}
              disabled={!canSubmit}
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
            >
              <Text style={styles.submitText}>{submitting ? 'Sending…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#4a5568',
  },
  section: {
    marginTop: 16,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pill: {
    borderWidth: 1,
    borderColor: '#cbd5e0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  pillActive: {
    backgroundColor: '#1e293b',
    borderColor: '#1e293b',
  },
  pillText: {
    fontWeight: '600',
    color: '#1f2937',
  },
  pillTextActive: {
    color: '#f1f5f9',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e0',
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  meta: {
    marginTop: 12,
    fontSize: 12,
    color: '#6b7280',
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  cancelText: {
    fontWeight: '600',
    color: '#4b5563',
  },
  submit: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  submitDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
});
