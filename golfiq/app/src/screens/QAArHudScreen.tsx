import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE } from '../lib/api';

import {
  FPS_MIN,
  HEADING_RMS_MAX_DEG,
  HUD_LATENCY_MAX_MS,
  RECENTER_MAX_S,
} from '../../../../shared/arhud/constants';
import { createHeadingSmoother } from '../../../../shared/arhud/heading_smoother';
import {
  createFrameBudgetTracker,
  now as clockNow,
} from '../../../../shared/arhud/native/clock';
import { createCameraStub } from '../../../../shared/arhud/native/camera_stub';
import { subscribeHeading } from '../../../../shared/arhud/native/heading';
import {
  ArhudState,
  createArhudStateMachine,
} from '../../../../shared/arhud/state_machine';

const BADGE_COLORS = {
  ok: '#14532d',
  warn: '#7f1d1d',
  neutral: '#1f2937',
} as const;

type BadgeStatus = keyof typeof BADGE_COLORS;

type DeviceInfo = {
  device: string;
  os: string;
  appVersion: string;
};

const INITIAL_DEVICE_INFO: DeviceInfo = {
  device: 'unknown',
  os: 'unknown',
  appVersion: 'dev',
};

type HudTelemetryEvent = {
  timestampMs: number;
  event: string;
  data: Record<string, unknown>;
};

const QAArHudScreen: React.FC = () => {
  const machineRef = useRef(createArhudStateMachine());
  const smootherRef = useRef(createHeadingSmoother());
  const frameBudgetRef = useRef(createFrameBudgetTracker());
  const camera = useMemo(() => createCameraStub(), []);

  const [hudState, setHudState] = useState<ArhudState>(
    machineRef.current.current(),
  );
  const stateRef = useRef(hudState);
  useEffect(() => {
    stateRef.current = hudState;
  }, [hudState]);

  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [headingRaw, setHeadingRaw] = useState(0);
  const [headingSmoothed, setHeadingSmoothed] = useState(0);
  const [headingRms, setHeadingRms] = useState(0);
  const [captureActive, setCaptureActive] = useState(false);
  const [recenterBusy, setRecenterBusy] = useState(false);
  const [lastRecenterMs, setLastRecenterMs] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(INITIAL_DEVICE_INFO);

  const headingRawRef = useRef(0);
  const headingSmoothedRef = useRef(0);
  const headingRmsRef = useRef(0);

  const sessionRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const fpsSamplesRef = useRef<number[]>([]);
  const latencySamplesRef = useRef<number[]>([]);
  const rmsSamplesRef = useRef<number[]>([]);
  const recenterSamplesRef = useRef<number[]>([]);
  const hudRunRef = useRef<HudTelemetryEvent[]>([]);
  const hudRunPathRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushLog = useCallback((entry: string) => {
    setLogs((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 5);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Device = await import('expo-device');
        const { default: Constants } = await import('expo-constants');
        const deviceName = Device?.modelName ?? 'unknown';
        const osName = Device?.osName ?? 'unknown';
        const osVersion = Device?.osVersion ?? '';
        const os = [osName, osVersion].filter(Boolean).join(' ').trim() || 'unknown';
        const appVersion =
          Constants?.expoConfig?.version ??
          Constants?.expoConfig?.runtimeVersion ??
          Constants?.manifest?.version ??
          'dev';
        if (!cancelled) {
          setDeviceInfo({
            device: deviceName || 'unknown',
            os,
            appVersion: appVersion ?? 'dev',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDeviceInfo(INITIAL_DEVICE_INFO);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistHudRun = useCallback(async () => {
    try {
      const FileSystem = await import('expo-file-system');
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        return null;
      }
      const path = directory + 'hud_run.json';
      await FileSystem.writeAsStringAsync(
        path,
        JSON.stringify(hudRunRef.current, null, 2),
      );
      hudRunPathRef.current = path;
      return path;
    } catch (error) {
      pushLog(
        `persist failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }, [pushLog]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) {
      return;
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistHudRun();
    }, 250);
  }, [persistHudRun]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      camera.stop();
    };
  }, [camera]);

  const recordTelemetry = useCallback(
    (event: string, data: Record<string, unknown>) => {
      const record: HudTelemetryEvent = {
        timestampMs: Date.now(),
        event,
        data,
      };
      hudRunRef.current.push(record);
      schedulePersist();
      const sessionId = sessionRef.current;
      void (async () => {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          const apiKey =
            process.env.EXPO_PUBLIC_API_KEY ??
            process.env.QA_HUD_API_KEY ??
            process.env.API_KEY;
          if (apiKey) {
            headers['X-API-Key'] = apiKey;
          }
          await fetch(`${API_BASE}/telemetry`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...record,
              sessionId,
            }),
          });
        } catch (error) {
          pushLog(
            `telemetry error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      })();
    },
    [schedulePersist, pushLog],
  );

  const handleFrame = useCallback(
    (frame: { captureTs: number; latencyMs: number }) => {
      const displayTs = clockNow();
      const budget = frameBudgetRef.current.sample(
        frame.captureTs,
        displayTs,
        frame.latencyMs,
      );
      const latency = frame.latencyMs ?? budget.latencyMs;
      setFps(budget.fps);
      setLatencyMs(latency);
      fpsSamplesRef.current.push(budget.fps);
      latencySamplesRef.current.push(latency);
      rmsSamplesRef.current.push(headingRmsRef.current);
      recordTelemetry('hud.frame', {
        t: displayTs,
        fps: budget.fps,
        latencyMs: latency,
        headingRaw: headingRawRef.current,
        headingSmoothed: headingSmoothedRef.current,
        rms: headingRmsRef.current,
        state: stateRef.current,
      });
    },
    [recordTelemetry],
  );

  useEffect(() => {
    const unsubscribe = subscribeHeading((deg) => {
      headingRawRef.current = deg;
      setHeadingRaw(deg);
      const smoothed = smootherRef.current.next(deg);
      headingSmoothedRef.current = smoothed;
      setHeadingSmoothed(smoothed);
      const rms = smootherRef.current.rms();
      headingRmsRef.current = rms;
      setHeadingRms(rms);
    });
    return unsubscribe;
  }, []);

  const startSession = useCallback(async () => {
    if (captureActive) {
      return;
    }
    const sessionId = `hud-${Date.now().toString(36)}`;
    sessionRef.current = sessionId;
    sessionStartRef.current = clockNow();
    fpsSamplesRef.current = [];
    latencySamplesRef.current = [];
    rmsSamplesRef.current = [];
    recenterSamplesRef.current = [];
    hudRunRef.current = [];
    frameBudgetRef.current.reset();
    smootherRef.current.reset();
    machineRef.current.reset();
    const baselineState = machineRef.current.current();
    setHudState(baselineState);
    headingRmsRef.current = 0;
    headingSmoothedRef.current = 0;
    headingRawRef.current = 0;
    await persistHudRun();
    setCaptureActive(true);
    pushLog(`session ${sessionId} started`);
    recordTelemetry('hud.session.start', {
      sessionId,
      device: deviceInfo.device,
      os: deviceInfo.os,
      appVersion: deviceInfo.appVersion,
    });
    try {
      await camera.start(handleFrame);
    } catch (error) {
      pushLog(
        `camera start failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [
    camera,
    captureActive,
    deviceInfo.appVersion,
    deviceInfo.device,
    deviceInfo.os,
    handleFrame,
    persistHudRun,
    pushLog,
    recordTelemetry,
  ]);

  const stopSession = useCallback(() => {
    if (!captureActive) {
      return;
    }
    camera.stop();
    setCaptureActive(false);
    const durationMs = sessionStartRef.current
      ? clockNow() - sessionStartRef.current
      : 0;
    const duration = durationMs / 1000;
    const avgFps = average(fpsSamplesRef.current);
    const p95Latency = percentile(latencySamplesRef.current, 0.95);
    const rmsMean = average(rmsSamplesRef.current);
    recordTelemetry('hud.session.end', {
      sessionId: sessionRef.current,
      duration,
      avgFps,
      p95Latency,
      rmsMean,
      recenterSamples: [...recenterSamplesRef.current],
    });
    pushLog('session stopped');
    sessionRef.current = null;
  }, [camera, captureActive, recordTelemetry, pushLog]);

  const toggleCapture = useCallback(() => {
    if (captureActive) {
      stopSession();
    } else {
      void startSession();
    }
  }, [captureActive, startSession, stopSession]);

  const handleRecenter = useCallback(async () => {
    if (!captureActive || recenterBusy) {
      return;
    }
    setRecenterBusy(true);
    const machine = machineRef.current;
    machine.dispatch('recenterRequested');
    const updatedState = machine.current();
    setHudState(updatedState);
    pushLog('recenter requested');
    const started = clockNow();
    let elapsed = 0;
    try {
      elapsed = await camera.requestRecenter();
    } catch (error) {
      pushLog(
        `recenter error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      if (!elapsed) {
        elapsed = clockNow() - started;
      }
    }
    machine.dispatch('recentered');
    const nextState = machine.current();
    setHudState(nextState);
    smootherRef.current.reset();
    recenterSamplesRef.current.push(elapsed);
    setLastRecenterMs(elapsed);
    recordTelemetry('hud.recenter', {
      t: clockNow(),
      elapsedSinceRequest: elapsed,
      state: nextState,
    });
    pushLog(`recenter complete (${(elapsed / 1000).toFixed(2)}s)`);
    setRecenterBusy(false);
  }, [
    camera,
    captureActive,
    recenterBusy,
    recordTelemetry,
    pushLog,
  ]);

  const exportRun = useCallback(async () => {
    try {
      const FileSystem = await import('expo-file-system');
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        pushLog('file system unavailable');
        return;
      }
      if (!hudRunRef.current.length) {
        await FileSystem.writeAsStringAsync(directory + 'hud_run.json', '[]');
      }
      const path = hudRunPathRef.current ?? directory + 'hud_run.json';
      const data = await FileSystem.readAsStringAsync(path);
      const runId = (sessionRef.current ?? `hud-${Date.now()}`).replace(
        /[^a-zA-Z0-9-_]/g,
        '',
      );
      const apiKey =
        process.env.EXPO_PUBLIC_API_KEY ??
        process.env.QA_HUD_API_KEY ??
        process.env.API_KEY;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }
      const handshake = await fetch(`${API_BASE}/runs/upload-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ runId }),
      });
      if (!handshake.ok) {
        pushLog(`export handshake failed (${handshake.status})`);
        return;
      }
      const info = await handshake.json();
      if (info.backend === 's3' && info.url) {
        const s3Headers: Record<string, string> = info.headers ?? {};
        if (!('Content-Type' in s3Headers)) {
          s3Headers['Content-Type'] = 'application/json';
        }
        const upload = await fetch(info.url, {
          method: 'PUT',
          headers: s3Headers,
          body: data,
        });
        if (upload.ok) {
          pushLog('hud_run.json exported via S3');
        } else {
          pushLog(`export upload failed (${upload.status})`);
        }
        return;
      }
      if (info.formUrl && info.key) {
        const result = await FileSystem.uploadAsync(
          `${API_BASE}${info.formUrl}`,
          path,
          {
            fieldName: 'file',
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            parameters: { key: info.key },
            headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
          },
        );
        if (result.status >= 200 && result.status < 300) {
          pushLog('hud_run.json exported');
        } else {
          pushLog(`export upload failed (${result.status})`);
        }
      }
    } catch (error) {
      pushLog(
        `export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [pushLog]);

  const fpsStatus: BadgeStatus = fps >= FPS_MIN ? 'ok' : 'warn';
  const latencyStatus: BadgeStatus =
    latencyMs <= HUD_LATENCY_MAX_MS ? 'ok' : 'warn';
  const headingStatus: BadgeStatus =
    headingRms <= HEADING_RMS_MAX_DEG ? 'ok' : 'warn';
  const recenterStatus: BadgeStatus =
    lastRecenterMs === null
      ? 'neutral'
      : lastRecenterMs / 1000 <= RECENTER_MAX_S
      ? 'ok'
      : 'warn';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>QA HUD Telemetry</Text>
      <Text style={styles.subTitle}>
        Device: {deviceInfo.device} • OS: {deviceInfo.os} • App:{' '}
        {deviceInfo.appVersion}
      </Text>
      <View style={styles.metricsRow}>
        <MetricBadge label="State" value={hudState} status="neutral" />
        <MetricBadge
          label="FPS"
          value={`${formatNumber(fps)}`}
          status={fpsStatus}
        />
        <MetricBadge
          label="Latency"
          value={`${formatNumber(latencyMs)} ms`}
          status={latencyStatus}
        />
        <MetricBadge
          label="Heading RMS"
          value={`${formatNumber(headingRms, 2)}°`}
          status={headingStatus}
        />
        <MetricBadge
          label="Re-center"
          value={
            lastRecenterMs === null
              ? '–'
              : `${formatNumber(lastRecenterMs / 1000, 2)} s`
          }
          status={recenterStatus}
        />
      </View>
      <View style={styles.headingBlock}>
        <Text style={styles.headingText}>
          Heading raw: {formatNumber(headingRaw, 1)}°
        </Text>
        <Text style={styles.headingText}>
          Heading smooth: {formatNumber(headingSmoothed, 1)}°
        </Text>
      </View>
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[
            styles.button,
            captureActive ? styles.stopButton : styles.startButton,
          ]}
          onPress={toggleCapture}
        >
          <Text style={styles.buttonText}>
            {captureActive ? 'Stop capture' : 'Start capture'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            styles.secondaryButton,
            (!captureActive || recenterBusy) && styles.disabledButton,
          ]}
          onPress={handleRecenter}
          disabled={!captureActive || recenterBusy}
        >
          <Text style={styles.buttonText}>Re-center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={exportRun}
        >
          <Text style={styles.buttonText}>Export</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Recent events</Text>
        {logs.length === 0 ? (
          <Text style={styles.logEntry}>No events yet.</Text>
        ) : (
          logs.map((entry, index) => (
            <Text key={`${entry}-${index}`} style={styles.logEntry}>
              {entry}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
};

type MetricBadgeProps = {
  label: string;
  value: string;
  status: BadgeStatus;
};

const MetricBadge: React.FC<MetricBadgeProps> = ({ label, value, status }) => {
  return (
    <View style={[styles.badge, { backgroundColor: BADGE_COLORS[status] }]}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={styles.badgeValue}>{value}</Text>
    </View>
  );
};

function formatNumber(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) {
    return '0.0';
  }
  return value.toFixed(fractionDigits);
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, item) => acc + item, 0);
  return sum / values.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index];
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  subTitle: { fontSize: 14, color: '#4b5563' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, minWidth: 110 },
  badgeLabel: { color: '#f9fafb', fontSize: 12, textTransform: 'uppercase' },
  badgeValue: { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  headingBlock: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 },
  headingText: { fontSize: 14, color: '#111827' },
  buttonsRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  startButton: { backgroundColor: '#1e3a8a' },
  stopButton: { backgroundColor: '#7f1d1d' },
  secondaryButton: { backgroundColor: '#1f2937' },
  disabledButton: { opacity: 0.4 },
  buttonText: { color: '#f9fafb', fontWeight: '600' },
  logContainer: { backgroundColor: '#0f172a', padding: 12, borderRadius: 8 },
  logTitle: { color: '#f9fafb', fontWeight: '700', marginBottom: 8 },
  logEntry: { color: '#f9fafb', fontSize: 12, marginBottom: 4 },
});

export default QAArHudScreen;
