import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  collectDiagnosticsSnapshot,
  exportDiagnosticsLogs,
  isTelemetryOptedOut,
  setTelemetryOptOut,
  type DiagnosticsSnapshot,
} from '../../../../shared/ops/log_export';
import {
  isCoachLearningOptedIn,
  resetPlayerProfile,
  resolveProfileId as resolveCoachProfileId,
  setCoachLearningOptIn,
} from '../../../../shared/coach/profile';
import {
  getUploadQueueSummary,
  subscribeToUploadQueueSummary,
  type UploadQueueSummary,
} from '../../../../shared/runs/uploader';
import {
  formatAccuracyMeters,
  formatDop,
  formatDualFrequency,
  formatSatelliteCount,
  gnssAccuracyLevel,
  getLocation,
  LocationError,
  type LocationFix,
} from '../../../../shared/arhud/location';
import { isQAMode } from '../../qa/QAGate';

const PRIVACY_DOCS_URL = 'https://docs.golfiq.dev/privacy';
const GNSS_POLICY_DOC_URL = 'https://docs.golfiq.dev/gnss-device-policy';

function formatTimestamp(value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') {
    return 'n/a';
  }
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatRelativeTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'n/a';
  }
  const deltaMs = Date.now() - value;
  if (deltaMs < 0) {
    return 'just now';
  }
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

function formatQueue(summary: UploadQueueSummary | null): string {
  if (!summary) {
    return 'No queue activity recorded.';
  }
  const parts: string[] = [
    `${summary.pending} pending`,
    summary.inFlight ? 'uploading' : 'idle',
    summary.offline ? 'offline' : 'online',
  ];
  if (summary.nextAttemptAt) {
    parts.push(`next retry ${formatRelativeTime(summary.nextAttemptAt)}`);
  }
  if (summary.lastFailureAt && summary.lastError) {
    parts.push(`last error ${formatRelativeTime(summary.lastFailureAt)} (${summary.lastError})`);
  }
  if (summary.lastSuccessAt) {
    parts.push(`last success ${formatRelativeTime(summary.lastSuccessAt)}`);
  }
  return parts.join(' • ');
}

function bagHighlights(snapshot: DiagnosticsSnapshot | null): string[] {
  if (!snapshot) {
    return [];
  }
  const bag = snapshot.bag.personal ?? snapshot.bag.defaults;
  const clubs: Array<keyof typeof bag> = ['D', '3W', '5i', '7i', 'PW', 'SW'];
  const rows = clubs
    .filter((club) => typeof bag[club] === 'number')
    .map((club) => `${club}: ${Math.round((bag[club] ?? 0) as number)} m`);
  if (snapshot.bag.hasOverrides) {
    rows.unshift('Personalized bag active');
  } else {
    rows.unshift('Default bag');
  }
  return rows;
}

function rcEntries(snapshot: DiagnosticsSnapshot | null): Array<[string, string]> {
  if (!snapshot) {
    return [];
  }
  return Object.entries(snapshot.rc).map(([key, value]) => [key, String(value)]);
}

function edgeSummary(snapshot: DiagnosticsSnapshot | null): string {
  if (!snapshot) {
    return '—';
  }
  const defaults = snapshot.edge.defaults;
  if (!defaults) {
    return `${snapshot.edge.platform} defaults unavailable`;
  }
  const parts = [defaults.runtime, `${defaults.inputSize}px`, defaults.quant];
  if (defaults.threads) {
    parts.push(`${defaults.threads} threads`);
  }
  if (defaults.delegate) {
    parts.push(defaults.delegate);
  }
  return parts.filter(Boolean).join(' • ');
}

function tuningSummary(snapshot: DiagnosticsSnapshot | null): string {
  if (!snapshot) {
    return 'No tuning data';
  }
  if (!snapshot.tuning.active) {
    return 'Default coefficients';
  }
  const { samples, alpha, updatedAt } = snapshot.tuning;
  const details: string[] = [];
  if (typeof samples === 'number') {
    details.push(`${samples} samples`);
  }
  if (typeof alpha === 'number') {
    details.push(`α=${alpha.toFixed(2)}`);
  }
  details.push(`updated ${formatRelativeTime(updatedAt ?? null)}`);
  return `Active • ${details.join(' • ')}`;
}

function logsSummary(snapshot: DiagnosticsSnapshot | null): string {
  if (!snapshot) {
    return 'No logs captured yet.';
  }
  const windowMin = Math.round((snapshot.logs.windowMs ?? 0) / 60000);
  const reliability = snapshot.logs.reliability?.length ?? 0;
  const buffer = snapshot.logs.buffer?.length ?? 0;
  return `${reliability} reliability events, ${buffer} buffered logs in last ${windowMin || 0} min.`;
}

const AboutDiagnostics: React.FC = () => {
  const qaMode = useMemo(() => isQAMode(), []);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gnssFix, setGnssFix] = useState<LocationFix | null>(null);
  const [gnssError, setGnssError] = useState<string | null>(null);
  const [queueSummary, setQueueSummary] = useState<UploadQueueSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [telemetryOptOut, setTelemetryOptOutState] = useState<boolean>(isTelemetryOptedOut());
  const [coachLearningOptIn, setCoachLearningOptInState] = useState(false);
  const [coachResetting, setCoachResetting] = useState(false);
  const [coachStatusMessage, setCoachStatusMessage] = useState<string | null>(null);

  const effectiveQueue = queueSummary ?? snapshot?.queue ?? null;

  const refreshDiagnostics = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setGnssError(null);
    try {
      const next = await collectDiagnosticsSnapshot({ hints: { qaMode } });
      setSnapshot(next);
      setTelemetryOptOutState(next.telemetry.optOut);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load diagnostics.';
      setError(message);
    }
    try {
      const fix = await getLocation();
      setGnssFix(fix);
    } catch (err) {
      if (err instanceof LocationError) {
        setGnssError(
          err.code === 'permission-denied' ? 'Location permission denied.' : 'Location unavailable.',
        );
      } else if (err instanceof Error) {
        setGnssError(err.message);
      } else {
        setGnssError('Location unavailable.');
      }
      setGnssFix(null);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [qaMode]);

  useEffect(() => {
    refreshDiagnostics().catch(() => {
      setLoading(false);
    });
  }, [refreshDiagnostics]);

  useEffect(() => {
    let cancelled = false;
    getUploadQueueSummary()
      .then((summary) => {
        if (!cancelled) {
          setQueueSummary(summary);
        }
      })
      .catch(() => {});
    const unsubscribe = subscribeToUploadQueueSummary((summary) => {
      setQueueSummary(summary);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const optedIn = await isCoachLearningOptedIn();
        if (!cancelled) {
          setCoachLearningOptInState(optedIn);
        }
      } catch {
        if (!cancelled) {
          setCoachLearningOptInState(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (queueSummary) {
      setSnapshot((prev) => (prev ? { ...prev, queue: queueSummary } : prev));
    }
  }, [queueSummary]);

  const handleExportLogs = useCallback(async () => {
    if (!snapshot || exporting) {
      return;
    }
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await exportDiagnosticsLogs({ snapshot, hints: { qaMode } });
      const message = result.issueId
        ? `Submitted. Issue ID: ${result.issueId}`
        : `Submitted ${result.logCount} entries.`;
      setExportMessage(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export logs.';
      setExportMessage(message);
    } finally {
      setExporting(false);
    }
  }, [exporting, qaMode, snapshot]);

  const handleCopyDiagnostics = useCallback(async () => {
    if (!snapshot) {
      setCopyMessage('Nothing to copy yet.');
      return;
    }
    try {
      const Clipboard = (await import('expo-clipboard')) as { setStringAsync?: (value: string) => Promise<void> };
      if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(JSON.stringify(snapshot, null, 2));
        setCopyMessage('Diagnostics copied to clipboard.');
        return;
      }
      setCopyMessage('Clipboard unavailable in this runtime.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clipboard module unavailable.';
      setCopyMessage(message);
    }
  }, [snapshot]);

  const handleTelemetryToggle = useCallback(
    (enabled: boolean) => {
      const optOut = !enabled;
      setTelemetryOptOut(optOut);
      setTelemetryOptOutState(optOut);
      setSnapshot((prev) => (prev ? { ...prev, telemetry: { ...prev.telemetry, optOut } } : prev));
    },
    [],
  );

  const handleCoachLearningToggle = useCallback(
    async (enabled: boolean) => {
      setCoachLearningOptInState(enabled);
      try {
        await setCoachLearningOptIn(enabled);
        setCoachStatusMessage(enabled ? 'Coach learning enabled.' : 'Coach learning disabled.');
      } catch (error) {
        setCoachStatusMessage('Failed to update coach learning preference.');
      }
    },
    [],
  );

  const handleCoachReset = useCallback(async () => {
    if (coachResetting) {
      return;
    }
    setCoachResetting(true);
    setCoachStatusMessage('Resetting coach profile…');
    try {
      const id = await resolveCoachProfileId();
      await resetPlayerProfile(id);
      setCoachStatusMessage('Coach profile cleared.');
    } catch (error) {
      setCoachStatusMessage('Failed to reset coach profile.');
    } finally {
      setCoachResetting(false);
    }
  }, [coachResetting]);

  const openPrivacyDocs = useCallback(() => {
    Linking.openURL(PRIVACY_DOCS_URL).catch(() => {
      setCopyMessage('Unable to open privacy documentation.');
    });
  }, []);

  const openGnssPolicy = useCallback(() => {
    Linking.openURL(GNSS_POLICY_DOC_URL).catch(() => {
      Alert.alert('Unable to open GNSS device policy', GNSS_POLICY_DOC_URL);
    });
  }, []);

  const bagRows = useMemo(() => bagHighlights(snapshot), [snapshot]);
  const rcRows = useMemo(() => rcEntries(snapshot), [snapshot]);
  const logsRow = useMemo(() => logsSummary(snapshot), [snapshot]);
  const edgeRow = useMemo(() => edgeSummary(snapshot), [snapshot]);
  const tuningRow = useMemo(() => tuningSummary(snapshot), [snapshot]);
  const gnssAccuracyValue = useMemo(() => {
    if (!gnssFix) {
      return null;
    }
    if (typeof gnssFix.accuracy_m === 'number' && Number.isFinite(gnssFix.accuracy_m)) {
      return gnssFix.accuracy_m;
    }
    if (typeof gnssFix.acc_m === 'number' && Number.isFinite(gnssFix.acc_m)) {
      return gnssFix.acc_m;
    }
    return null;
  }, [gnssFix?.accuracy_m, gnssFix?.acc_m]);
  const gnssLevel = useMemo(() => gnssAccuracyLevel(gnssAccuracyValue), [gnssAccuracyValue]);
  const gnssSummaryText = useMemo(
    () =>
      [
        formatAccuracyMeters(gnssAccuracyValue),
        formatSatelliteCount(gnssFix?.sats ?? null),
        formatDop(gnssFix?.dop ?? null),
        formatDualFrequency(gnssFix?.dualFreqGuess ?? null),
      ].join(' • '),
    [gnssAccuracyValue, gnssFix?.sats, gnssFix?.dop, gnssFix?.dualFreqGuess],
  );
  const gnssTipText = gnssLevel === 'poor' ? 'Tip: stand still 2–3 s for a tighter fix.' : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>About &amp; Diagnostics</Text>
          <TouchableOpacity onPress={refreshDiagnostics} style={styles.refreshButton} disabled={refreshing}>
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Inspect beta build metadata, rollout state, and QA signals.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading diagnostics…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Version</Text>
          <Text style={styles.mono}>App version: {snapshot.version.appVersion} (build {snapshot.version.buildNumber})</Text>
          <Text style={styles.mono}>Git SHA: {snapshot.version.gitSha}</Text>
          <Text style={styles.mono}>Built at: {formatTimestamp(snapshot.version.builtAtUTC)}</Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform &amp; device</Text>
          <Text style={styles.body}>
            {snapshot.platform.os} {snapshot.platform.version ?? ''} • {formatTimestamp(snapshot.capturedAt)}
          </Text>
          <Text style={styles.body}>Model: {String(snapshot.device.modelName ?? snapshot.device.modelId ?? 'unknown')}</Text>
          <Text style={styles.body}>Runtime: {String(snapshot.device.runtimeVersion ?? 'n/a')}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GNSS health</Text>
        <Text style={styles.body}>{gnssSummaryText}</Text>
        {gnssTipText ? <Text style={styles.caption}>{gnssTipText}</Text> : null}
        {gnssError ? <Text style={[styles.caption, styles.captionError]}>{gnssError}</Text> : null}
        <TouchableOpacity onPress={openGnssPolicy}>
          <Text style={styles.link}>{GNSS_POLICY_DOC_URL}</Text>
        </TouchableOpacity>
      </View>

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rollout</Text>
          <Text style={styles.body}>
            Percent: {snapshot.rollout.percent}% • Enforced: {snapshot.rollout.enforced ? 'yes' : 'no'} • Kill: {snapshot.rollout.kill ? 'yes' : 'no'}
          </Text>
          <Text style={styles.body}>Device bucket: {snapshot.rollout.bucket ?? hashDeviceBucket(snapshot.rollout.deviceId)}</Text>
          <Text style={styles.body}>Device ID: {snapshot.rollout.deviceId}</Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Edge runtime</Text>
          <Text style={styles.body}>{edgeRow}</Text>
          <Text style={styles.body}>
            Model pin: {snapshot.edge.pinnedModelId ? snapshot.edge.pinnedModelId : 'not pinned'}
          </Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tuned coefficients</Text>
          <Text style={styles.body}>{tuningRow}</Text>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bag summary</Text>
          {bagRows.map((row) => (
            <Text key={row} style={styles.body}>
              {row}
            </Text>
          ))}
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rollout controls (RC)</Text>
          {rcRows.length === 0 ? <Text style={styles.body}>No RC flags available.</Text> : null}
          {rcRows.map(([key, value]) => (
            <View key={key} style={styles.rcRow}>
              <Text style={[styles.mono, styles.rcKey]}>{key}</Text>
              <Text style={styles.mono}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upload queue</Text>
        <Text style={styles.body}>{formatQueue(effectiveQueue)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Logs</Text>
        <Text style={styles.body}>{logsRow}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <TouchableOpacity
          style={[styles.button, exporting || !snapshot ? styles.buttonDisabled : null]}
          onPress={handleExportLogs}
          disabled={exporting || !snapshot}
        >
          <Text style={styles.buttonText}>{exporting ? 'Exporting…' : 'Export logs'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !snapshot ? styles.buttonDisabled : null]}
          onPress={handleCopyDiagnostics}
          disabled={!snapshot}
        >
          <Text style={styles.buttonText}>Copy diagnostics</Text>
        </TouchableOpacity>
        {exportMessage ? <Text style={styles.statusText}>{exportMessage}</Text> : null}
        {copyMessage ? <Text style={styles.statusText}>{copyMessage}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy &amp; Data</Text>
        <Text style={styles.body}>
          Beta builds collect limited QA telemetry to diagnose accuracy and reliability. Telemetry is
          optional and only streams while this toggle is on.
        </Text>
        <Text style={styles.body}>
          Export: use the “Export logs” action above to download a JSON copy for yourself or support.
        </Text>
        <Text style={styles.body}>
          Erase: turn telemetry off here to stop new uploads, then clear QA telemetry from Settings →
          Reset (or delete the app) to remove stored diagnostics. Server copies are removed on
          request via privacy@golfiq.dev.
        </Text>
        <TouchableOpacity onPress={openPrivacyDocs}>
          <Text style={styles.link}>{PRIVACY_DOCS_URL}</Text>
        </TouchableOpacity>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.body}>QA telemetry</Text>
            <Text style={styles.caption}>Enabled only in QA mode. Turn off to pause log streaming.</Text>
          </View>
          <Switch
            value={!telemetryOptOut}
            onValueChange={handleTelemetryToggle}
            disabled={!qaMode}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.body}>Coach learning</Text>
            <Text style={styles.caption}>
              Personalize practice plans and advice locally. Turn off to keep recommendations static.
            </Text>
          </View>
          <Switch value={coachLearningOptIn} onValueChange={handleCoachLearningToggle} />
        </View>
        <TouchableOpacity
          style={[styles.button, coachResetting ? styles.buttonDisabled : null]}
          onPress={handleCoachReset}
          disabled={coachResetting}
        >
          <Text style={styles.buttonText}>{coachResetting ? 'Resetting…' : 'Reset Coach profile'}</Text>
        </TouchableOpacity>
        {coachStatusMessage ? <Text style={styles.statusText}>{coachStatusMessage}</Text> : null}
        {!qaMode ? <Text style={styles.caption}>Telemetry toggle available in QA environments.</Text> : null}
      </View>
    </ScrollView>
  );
};

function hashDeviceBucket(deviceId: string): number {
  if (!deviceId) {
    return 0;
  }
  let hash = 0;
  for (let i = 0; i < deviceId.length; i += 1) {
    hash = (hash * 33 + deviceId.charCodeAt(i)) % 1000;
  }
  return hash % 100;
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  refreshText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#0f172a',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  section: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5f5',
    gap: 6,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  body: {
    color: '#0f172a',
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#0f172a',
  },
  rcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rcKey: {
    flexShrink: 1,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  statusText: {
    color: '#0f172a',
    marginTop: 6,
  },
  link: {
    color: '#2563eb',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  toggleLabel: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  caption: {
    color: '#64748b',
    fontSize: 12,
  },
  captionError: {
    color: '#b91c1c',
  },
});

export default AboutDiagnostics;
