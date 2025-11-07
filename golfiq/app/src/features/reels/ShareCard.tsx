import React, { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

import type { ReelShotRef } from '../../../../shared/reels/types';
import { buildShareUrl } from './qr';

type ShareCardProps = {
  shots: ReelShotRef[];
  overlay?: Record<string, unknown> | null;
  baseUrl?: string;
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    padding: 20,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  qrWrapper: {
    alignSelf: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  actionButton: {
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: '#22d3ee',
    borderColor: '#22d3ee',
  },
  primaryText: {
    color: '#083344',
    fontWeight: '600',
    fontSize: 14,
  },
  secondary: {
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  secondaryText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  status: {
    fontSize: 12,
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
  },
});

function buildPayload(shots: ReelShotRef[], overlay: Record<string, unknown> | null | undefined): unknown {
  const clipRefs = shots.map((shot) => ({
    id: shot.id,
    ts: shot.ts,
    club: shot.club,
    carry_m: shot.carry_m,
    tracer: shot.tracer,
  }));
  return {
    shots: clipRefs,
    timeline: overlay ?? undefined,
  };
}

const ShareCard: React.FC<ShareCardProps> = ({ shots, overlay, baseUrl }) => {
  const payload = useMemo(() => buildPayload(shots, overlay), [shots, overlay]);
  const shareUrl = useMemo(() => buildShareUrl(payload, { baseUrl }), [payload, baseUrl]);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      setStatus('Link copied to clipboard');
      setIsError(false);
    } catch (error) {
      setStatus('Unable to copy link');
      setIsError(true);
    }
  }, [shareUrl]);

  const handleOpen = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(shareUrl);
      if (!supported) {
        throw new Error('No handler for URL');
      }
      await Linking.openURL(shareUrl);
      setStatus('Opened composer on web');
      setIsError(false);
    } catch (error) {
      setStatus('Unable to open link');
      setIsError(true);
    }
  }, [shareUrl]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Share to web</Text>
        <Text style={styles.subtitle}>Scan the code to pick up this swing in the web composer.</Text>
      </View>
      <View style={styles.qrWrapper}>
        <QRCode value={shareUrl} size={200} backgroundColor="#0f172a" color="#22d3ee" />
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.subtitle} selectable>
          {shareUrl}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleCopy} style={[styles.actionButton, styles.secondary]} activeOpacity={0.85}>
          <Text style={styles.secondaryText}>Copy link</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpen} style={[styles.actionButton, styles.primary]} activeOpacity={0.9}>
          <Text style={styles.primaryText}>Open on web</Text>
        </TouchableOpacity>
      </View>
      {status ? (
        <Text style={[styles.status, isError && styles.error]}>{status}</Text>
      ) : null}
    </View>
  );
};

export default ShareCard;
