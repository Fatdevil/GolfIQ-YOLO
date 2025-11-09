import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, Vibration } from 'react-native';

import { BarCodeScanner } from 'expo-barcode-scanner';

import { joinByCode } from '@app/api/events';
import type { RootStackParamList } from '@app/navigation/types';
import { safeEmit } from '@app/telemetry';
import { extractJoinCode } from '@app/utils/qr';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

const RESCAN_DELAY_MS = 1200;

type Props = NativeStackScreenProps<RootStackParamList, 'EventScan'>;

type ScanEvent = { data?: string | null };

export default function EventScanScreen({ navigation }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ignoreUntilRef = useRef(0);

  const onBarCodeScanned = useCallback(
    async ({ data }: ScanEvent) => {
      const now = Date.now();
      if (now < ignoreUntilRef.current || loading) {
        return;
      }
      const payload = data ?? '';
      const code = extractJoinCode(payload);
      if (!code) {
        safeEmit('events.scan.read', { ok: false, raw: payload });
        setError('Ogiltig kod');
        try {
          Vibration.vibrate(60);
        } catch {
          // ignore vibration errors in test/runtime environments
        }
        return;
      }
      ignoreUntilRef.current = now + RESCAN_DELAY_MS;
      setError(null);
      setLoading(true);
      safeEmit('events.scan.read', { ok: true, code });
      try {
        const result = await joinByCode(code);
        safeEmit('events.join.mobile', { code });
        navigation.navigate('EventLive', { id: result.eventId });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Kunde inte gå med';
        setError(message);
        try {
          Vibration.vibrate(60);
        } catch {
          // ignore vibration errors in test/runtime environments
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, navigation],
  );

  return (
    <View style={styles.container}>
      <BarCodeScanner
        testID="barcode-scanner"
        style={styles.scanner}
        onBarCodeScanned={onBarCodeScanned}
        barCodeTypes={BarCodeScanner.Constants.BarCodeType.qr}
      />
      <View style={styles.overlay}>
        <Text style={styles.instructions}>Placera QR-koden inom ramen</Text>
        {loading && <Text style={styles.status}>Ansluter…</Text>}
        {error && (
          <Text style={styles.error} testID="scan-error">
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanner: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    gap: 8,
  },
  instructions: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    color: '#d1d5db',
    fontSize: 14,
  },
  error: {
    color: '#f87171',
    fontWeight: '600',
  },
});
