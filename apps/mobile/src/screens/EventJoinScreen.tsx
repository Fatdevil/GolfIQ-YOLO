import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { joinByCode } from '@app/api/events';
import type { RootStackParamList } from '@app/navigation/types';
import { safeEmit } from '@app/telemetry';
import { extractJoinCode } from '@app/utils/deepLink';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { validateCode } from '@shared/events/code';

const CODE_LENGTH = 7;

function normalizeInput(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, CODE_LENGTH);
}

type Props = NativeStackScreenProps<RootStackParamList, 'EventJoin'> & {
  initialCode?: string | null;
};

export default function EventJoinScreen({ navigation, route, initialCode }: Props): JSX.Element {
  const routeCode = route?.params?.code ?? null;
  const [code, setCode] = useState(() => normalizeInput(routeCode ?? initialCode ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoSubmitRef = useRef<string | null>(null);

  useEffect(() => {
    const next = normalizeInput(routeCode ?? initialCode ?? '');
    if (next && next !== code) {
      setCode(next);
    }
  }, [routeCode, initialCode]);

  const submit = useCallback(
    async (candidate?: string) => {
      const trimmed = normalizeInput(candidate ?? code);
      if (!validateCode(trimmed)) {
        setError('Enter a valid event code');
        setMessage(null);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const result = await joinByCode(trimmed);
        safeEmit('events.join.mobile', { code: trimmed });
        setMessage('Joined as spectator.');
        navigation.navigate('EventLive', { id: result.eventId });
      } catch (err) {
        const description = err instanceof Error ? err.message : 'Unable to join';
        setError(description);
        setMessage(null);
      } finally {
        setLoading(false);
      }
    },
    [code, navigation],
  );

  useEffect(() => {
    const nextUrlCode = extractJoinCode(routeCode ?? initialCode ?? null);
    if (!nextUrlCode) {
      return;
    }
    if (autoSubmitRef.current === nextUrlCode) {
      return;
    }
    autoSubmitRef.current = nextUrlCode;
    setCode(nextUrlCode);
    submit(nextUrlCode).catch(() => {
      /* handled via error state */
    });
  }, [initialCode, routeCode, submit]);

  const onChange = (value: string) => {
    const normalized = normalizeInput(value);
    setCode(normalized);
    setError(null);
    setMessage(null);
    if (normalized !== autoSubmitRef.current) {
      autoSubmitRef.current = null;
    }
  };

  const disableJoin = loading;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Event</Text>
      <Text style={styles.subtitle}>Enter the 7-character event code to join as a spectator.</Text>
      <TextInput
        value={code}
        onChangeText={onChange}
        placeholder="ABC1234"
        accessibilityLabel="Event code"
        testID="join-code-input"
        autoCapitalize="characters"
      />
      {error && (
        <Text style={styles.error} testID="join-error">
          {error}
        </Text>
      )}
      {message && (
        <Text style={styles.message} testID="join-message">
          {message}
        </Text>
      )}
      <TouchableOpacity
        accessibilityLabel="Join event"
        onPress={() => submit().catch(() => {})}
        disabled={disableJoin}
        testID="join-submit"
      >
        <View style={styles.button}>
          {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Join</Text>}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#444',
  },
  error: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  message: {
    color: '#047857',
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export const __private__ = {
  normalizeInput,
};
