import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { AccessPlan } from '@app/api/player';
import {
  fetchWatchStatus,
  requestWatchPairCode,
  type WatchDeviceStatus,
  type WatchPairCode,
} from '@app/api/watch';

type Props = {
  memberId: string;
  plan: AccessPlan;
};

const RECENT_SECONDS = 10 * 60;

function isRecent(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  const parsed = new Date(lastSeen);
  if (Number.isNaN(parsed.getTime())) return false;
  const diff = (Date.now() - parsed.getTime()) / 1000;
  return diff >= 0 && diff <= RECENT_SECONDS;
}

function formatRelative(lastSeen?: string | null): string {
  if (!lastSeen) return 'Not seen recently';
  const parsed = new Date(lastSeen);
  if (Number.isNaN(parsed.getTime())) return 'Not seen recently';
  const diff = (Date.now() - parsed.getTime()) / 1000;
  if (diff < 30) return 'Seen just now';
  if (diff < 90) return 'Seen a minute ago';
  const minutes = Math.round(diff / 60);
  return `Seen ${minutes} min ago`;
}

export function WatchStatusCard({ memberId, plan }: Props): JSX.Element {
  const isPro = plan.plan === 'pro';
  const [status, setStatus] = useState<WatchDeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<WatchPairCode | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWatchStatus(memberId)
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load watch status';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPro, memberId]);

  useEffect(() => {
    if (!pairCode) {
      setCountdown(0);
      return undefined;
    }
    const expiry = new Date(pairCode.expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setPairCode(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairCode]);

  const connected = useMemo(() => status?.paired && isRecent(status.lastSeenAt), [status]);
  const statusLabel = connected ? 'Watch HUD: Connected ✅' : 'Watch HUD: Not connected ❌';
  const lastSeenLabel = connected ? 'Ready on your watch' : formatRelative(status?.lastSeenAt);

  const handlePair = async () => {
    setPairing(true);
    setPairError(null);
    try {
      const code = await requestWatchPairCode(memberId);
      setPairCode(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch pair code';
      setPairError(message);
    } finally {
      setPairing(false);
    }
  };

  if (!isPro) {
    return (
      <View style={styles.card} testID="watch-status-upgrade">
        <View style={styles.headerRow}>
          <Text style={styles.title}>Watch HUD</Text>
          <Text style={styles.proPill}>Pro</Text>
        </View>
        <Text style={styles.subtitle}>Watch HUD is a Pro feature. Upgrade to sync hole distances to your watch.</Text>
        <TouchableOpacity accessibilityLabel="Upgrade to Pro">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Upgrade to Pro</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="watch-status-card">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Watch HUD</Text>
        <View style={[styles.pill, connected ? styles.pillConnected : styles.pillDisconnected]}>
          <Text style={styles.pillText}>{connected ? 'Connected' : 'Not connected'}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusText} testID="watch-status-label">
          {statusLabel}
        </Text>
        {loading && <ActivityIndicator size="small" />}
      </View>
      <Text style={styles.subtitle}>{lastSeenLabel}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => handlePair().catch(() => {})}
          disabled={pairing}
          accessibilityLabel="Pair watch"
          testID="pair-watch"
        >
          <View style={[styles.primaryButton, pairing && styles.buttonDisabled]}>
            <Text style={styles.primaryButtonText}>{pairing ? 'Pairing…' : 'Pair watch'}</Text>
          </View>
        </TouchableOpacity>
      </View>
      {pairError && <Text style={styles.errorText}>{pairError}</Text>}

      <Modal visible={!!pairCode} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pair your watch</Text>
            <Text style={styles.modalSubtitle}>Open GolfIQ on your watch and enter this code:</Text>
            <Text style={styles.pairCode} testID="pair-code-value">
              {pairCode?.code}
            </Text>
            <Text style={styles.modalSubtitle}>
              {countdown > 0 ? `Expires in ${countdown}s` : 'Code expired'}
            </Text>
            <TouchableOpacity onPress={() => setPairCode(null)} testID="close-pair-code">
              <View style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  subtitle: {
    color: '#475569',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  proPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    fontWeight: '700',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillConnected: {
    backgroundColor: '#dcfce7',
  },
  pillDisconnected: {
    backgroundColor: '#fee2e2',
  },
  pillText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#475569',
  },
  pairCode: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    color: '#0f172a',
  },
});

export default WatchStatusCard;
