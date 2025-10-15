import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_BASE } from '../lib/api';

import type { Platform as EdgeDefaultsPlatform } from '../../../../shared/edge/defaults';
import {
  fetchEdgeDefaults as fetchSharedEdgeDefaults,
  getCachedEdgeDefaults as getSharedCachedEdgeDefaults,
} from '../../../../shared/edge/defaults';

import {
  EdgeDelegate,
  EdgeDefaultsConfig,
  EdgePlatform,
  EdgeQuant,
  EdgeRuntime,
  getEmbeddedEdgeDefaults,
  pickDefaultsForPlatform,
  readEdgeDefaults,
} from '../../../../shared/arhud/native/edge_defaults';

const RUNTIMES: EdgeRuntime[] = ['tflite', 'coreml', 'onnx', 'ncnn'];
const INPUT_SIZES = [320, 384, 416];
const QUANTS: EdgeQuant[] = ['int8', 'fp16', 'fp32'];
const THREAD_OPTIONS = [1, 2, 4];

const MODEL_HINTS = [
  'models/edge/manifest.json',
  'models/detect/model.json',
  'models/edge/model.bin',
];

const platformKey: EdgePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

const defaultDelegates: Record<EdgePlatform, EdgeDelegate[]> = {
  android: ['cpu', 'nnapi', 'gpu'],
  ios: ['cpu', 'gpu'],
};

const DEFAULT_CONFIG: Record<EdgePlatform, EdgeDefaultsConfig> = {
  android: {
    runtime: 'tflite',
    inputSize: 320,
    quant: 'int8',
    threads: 2,
    delegate: 'nnapi',
  },
  ios: {
    runtime: 'coreml',
    inputSize: 384,
    quant: 'fp16',
    threads: 2,
    delegate: 'gpu',
  },
};

type BenchConfigState = {
  runtime: EdgeRuntime;
  inputSize: number;
  quant: EdgeQuant;
  threads: number;
  delegate: EdgeDelegate;
};

type DeviceInfo = {
  device: string;
  os: string;
  appVersion: string;
};

type BenchMetrics = {
  fpsAvg: number;
  p50: number;
  p95: number;
  memDelta: number | null;
  batteryStart: number | null;
  batteryEnd: number | null;
  batteryDelta: number | null;
  thermal: string | null;
  framesMeasured: number;
  durationMs: number;
};

type BenchResult = {
  metrics: BenchMetrics;
  dryRun: boolean;
  path: string;
  payload: Record<string, unknown>;
};

type SelectionOption<T> = {
  value: T;
  label: string;
};

const INITIAL_DEVICE: DeviceInfo = {
  device: 'unknown',
  os: 'unknown',
  appVersion: 'dev',
};

type ExpoFileSystemModule = {
  documentDirectory?: string | null;
  writeAsStringAsync(path: string, contents: string): Promise<void>;
};

async function loadExpoFileSystem(): Promise<ExpoFileSystemModule | null> {
  try {
    const mod = (await import('expo-file-system')) as ExpoFileSystemModule;
    return mod ?? null;
  } catch (error) {
    return null;
  }
}

function toRuntime(value: string | undefined): EdgeRuntime | null {
  if (!value) {
    return null;
  }
  const candidate = value.toLowerCase() as EdgeRuntime;
  return RUNTIMES.includes(candidate) ? candidate : null;
}

function toQuant(value: string | undefined): EdgeQuant | null {
  if (!value) {
    return null;
  }
  const candidate = value.toLowerCase() as EdgeQuant;
  return QUANTS.includes(candidate) ? candidate : null;
}

function toDelegate(value: string | undefined, allowed: EdgeDelegate[]): EdgeDelegate {
  if (value) {
    const candidate = value.toLowerCase() as EdgeDelegate;
    if (allowed.includes(candidate)) {
      return candidate;
    }
  }
  return allowed[0];
}

function clampInputSize(value: number | undefined): number {
  if (value && INPUT_SIZES.includes(value)) {
    return value;
  }
  return INPUT_SIZES[0];
}

function clampThreads(value: number | undefined): number {
  if (value && THREAD_OPTIONS.includes(value)) {
    return value;
  }
  return THREAD_OPTIONS[0];
}

function percentile(values: number[], target: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * target;
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const weight = index - lower;
  if (upper === lower) {
    return sorted[lower];
  }
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function readMemoryUsageMb(): number | null {
  const perf = (globalThis as typeof globalThis & {
    performance?: { memory?: { usedJSHeapSize?: number } };
  }).performance;
  const used = perf?.memory?.usedJSHeapSize;
  if (typeof used === 'number' && Number.isFinite(used)) {
    return used / (1024 * 1024);
  }
  return null;
}

async function readBatteryLevelPercent(): Promise<number | null> {
  try {
    const Battery = await import('expo-battery');
    if (Battery?.getBatteryLevelAsync) {
      const level = await Battery.getBatteryLevelAsync();
      if (typeof level === 'number' && Number.isFinite(level)) {
        return level * 100;
      }
    }
  } catch (error) {
    // ignore
  }
  return null;
}

async function readThermalState(): Promise<string | null> {
  try {
    const Device = await import('expo-device');
    const thermal = (Device as Record<string, unknown>).thermalState;
    if (typeof thermal === 'string' && thermal) {
      return thermal;
    }
  } catch (error) {
    // ignore
  }
  return null;
}

function syntheticLatencyMs(config: BenchConfigState, frameIndex: number): number {
  let base = 42;
  switch (config.runtime) {
    case 'coreml':
      base -= 7;
      break;
    case 'onnx':
      base += 5;
      break;
    case 'ncnn':
      base += 2;
      break;
    default:
      break;
  }

  switch (config.quant) {
    case 'int8':
      base -= 6;
      break;
    case 'fp16':
      base -= 3;
      break;
    default:
      break;
  }

  if (config.delegate === 'gpu') {
    base -= 5;
  } else if (config.delegate === 'nnapi') {
    base -= 3;
  }

  if (config.inputSize > 320) {
    base += (config.inputSize - 320) * 0.12;
  }

  const threadScale = Math.max(1, 4 / config.threads);
  base *= threadScale;

  const jitter = (Math.sin(frameIndex + config.inputSize) + 1.2) * 1.5;
  const latency = Math.max(8, base + jitter);
  return latency;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runSyntheticFrame(
  config: BenchConfigState,
  frameIndex: number,
  dryMode: boolean,
): Promise<number> {
  const latency = syntheticLatencyMs(config, frameIndex);
  const waitMs = dryMode ? Math.min(6, latency * 0.02) : Math.min(18, latency * 0.05);
  await delay(waitMs);
  return latency;
}

function buildPayload(
  config: BenchConfigState,
  device: DeviceInfo,
  metrics: BenchMetrics,
  dryRun: boolean,
): { payload: Record<string, unknown>; ts: string } {
  const ts = new Date().toISOString();
  const payload: Record<string, unknown> = {
    device: device.device,
    os: device.os,
    appVersion: device.appVersion,
    platform: platformKey,
    runtime: config.runtime,
    inputSize: config.inputSize,
    quant: config.quant,
    threads: config.threads,
    delegate: config.delegate,
    dryRun,
    fpsAvg: metrics.fpsAvg,
    p50: metrics.p50,
    p95: metrics.p95,
    memDelta: metrics.memDelta,
    batteryDelta: metrics.batteryDelta,
    batteryStart: metrics.batteryStart,
    batteryEnd: metrics.batteryEnd,
    thermal: metrics.thermal,
    ts,
  };
  return { payload, ts };
}

const QABenchScreen: React.FC = () => {
  const delegates = defaultDelegates[platformKey] ?? ['cpu'];
  const [config, setConfig] = useState<BenchConfigState>(() => {
    const embedded = pickDefaultsForPlatform(getEmbeddedEdgeDefaults(), platformKey);
    const base = embedded ?? DEFAULT_CONFIG[platformKey];
    return {
      runtime: toRuntime(base.runtime) ?? DEFAULT_CONFIG[platformKey].runtime,
      inputSize: clampInputSize(base.inputSize),
      quant: toQuant(base.quant) ?? DEFAULT_CONFIG[platformKey].quant,
      threads: clampThreads(base.threads),
      delegate: toDelegate(base.delegate, delegates),
    };
  });

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(INITIAL_DEVICE);
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const applyEdgeDefaults = useCallback(
    (
      candidate:
        | {
            runtime?: string;
            inputSize?: number;
            quant?: string;
            threads?: number | null | undefined;
            delegate?: string | null | undefined;
          }
        | null
        | undefined,
    ) => {
      if (!candidate) {
        return;
      }
      setConfig((prev) => ({
        runtime: toRuntime(candidate.runtime) ?? prev.runtime,
        inputSize:
          typeof candidate.inputSize === 'number'
            ? clampInputSize(candidate.inputSize)
            : prev.inputSize,
        quant: toQuant(candidate.quant) ?? prev.quant,
        threads:
          typeof candidate.threads === 'number'
            ? clampThreads(candidate.threads)
            : prev.threads,
        delegate:
          candidate.delegate !== undefined && candidate.delegate !== null
            ? toDelegate(candidate.delegate, delegates)
            : prev.delegate,
      }));
    },
    [delegates],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Device = await import('expo-device');
        const { default: Constants } = await import('expo-constants');
        const deviceName = (Device as Record<string, unknown>).modelName as
          | string
          | undefined;
        const osName = (Device as Record<string, unknown>).osName as string | undefined;
        const osVersion = (Device as Record<string, unknown>).osVersion as
          | string
          | undefined;
        const os = [osName, osVersion].filter(Boolean).join(' ').trim() || 'unknown';
        const appVersion =
          (Constants as Record<string, unknown>)?.expoConfig?.version ||
          (Constants as Record<string, unknown>)?.expoConfig?.runtimeVersion ||
          (Constants as Record<string, unknown>)?.manifest?.version ||
          'dev';
        if (!cancelled) {
          setDeviceInfo({
            device: deviceName || 'unknown',
            os,
            appVersion: typeof appVersion === 'string' ? appVersion : 'dev',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDeviceInfo(INITIAL_DEVICE);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sharedPlatform = platformKey as EdgeDefaultsPlatform;
      try {
        const cached = await getSharedCachedEdgeDefaults(sharedPlatform);
        if (!cancelled) {
          applyEdgeDefaults(cached);
        }
      } catch (error) {
        // ignore
      }
      try {
        const defaults = await readEdgeDefaults();
        if (!cancelled && defaults) {
          applyEdgeDefaults(pickDefaultsForPlatform(defaults, platformKey));
        }
      } catch (error) {
        // ignore
      }
      try {
        const remote = await fetchSharedEdgeDefaults({ platform: sharedPlatform });
        if (cancelled) {
          return;
        }
        applyEdgeDefaults(remote[platformKey]);
      } catch (error) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyEdgeDefaults]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const FileSystem = await import('expo-file-system');
        const directory = FileSystem.documentDirectory;
        if (!directory) {
          if (!cancelled) {
            setModelAvailable(false);
          }
          return;
        }
        for (const hint of MODEL_HINTS) {
          try {
            const info = await FileSystem.getInfoAsync(directory + hint);
            if (info.exists) {
              if (!cancelled) {
                setModelAvailable(true);
              }
              return;
            }
          } catch (error) {
            // ignore individual checks
          }
        }
        if (!cancelled) {
          setModelAvailable(false);
        }
      } catch (error) {
        if (!cancelled) {
          setModelAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    return {
      runtime: RUNTIMES.map<SelectionOption<EdgeRuntime>>((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      inputSize: INPUT_SIZES.map<SelectionOption<number>>((value) => ({
        value,
        label: String(value),
      })),
      quant: QUANTS.map<SelectionOption<EdgeQuant>>((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      threads: THREAD_OPTIONS.map<SelectionOption<number>>((value) => ({
        value,
        label: String(value),
      })),
      delegate: delegates.map<SelectionOption<EdgeDelegate>>((value) => ({
        value,
        label: value.toUpperCase(),
      })),
    };
  }, [delegates]);

  const runBenchmark = useCallback(async () => {
    if (running) {
      return;
    }
    setRunning(true);
    setStatus('Running benchmark…');
    setUploadStatus(null);
    try {
      const dryRun = modelAvailable === false;
      const warmupFrames = 10;
      const maxFrames = 100;
      const maxDurationMs = 10_000;
      const latencies: number[] = [];

      const startBattery = await readBatteryLevelPercent();
      const startMem = readMemoryUsageMb();
      const thermal = await readThermalState();
      const startTime = Date.now();

      for (let i = 0; i < warmupFrames; i += 1) {
        await runSyntheticFrame(config, i, dryRun);
      }

      let measured = 0;
      while (measured < maxFrames && Date.now() - startTime < maxDurationMs) {
        const latency = await runSyntheticFrame(config, measured, dryRun);
        latencies.push(latency);
        measured += 1;
      }

      const durationMs = Date.now() - startTime;
      const avgLatency =
        latencies.length > 0
          ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
          : 0;
      const fpsAvg = avgLatency > 0 ? 1000 / avgLatency : 0;
      const p50 = percentile(latencies, 0.5);
      const p95 = percentile(latencies, 0.95);
      const endBattery = await readBatteryLevelPercent();
      const endMem = readMemoryUsageMb();

      const memDelta =
        startMem !== null && endMem !== null ? Number((endMem - startMem).toFixed(2)) : null;
      const batteryDelta =
        startBattery !== null && endBattery !== null
          ? Number((endBattery - startBattery).toFixed(2))
          : null;

      const metrics: BenchMetrics = {
        fpsAvg: Number(fpsAvg.toFixed(2)),
        p50: Number(p50.toFixed(2)),
        p95: Number(p95.toFixed(2)),
        memDelta,
        batteryStart: startBattery !== null ? Number(startBattery.toFixed(2)) : null,
        batteryEnd: endBattery !== null ? Number(endBattery.toFixed(2)) : null,
        batteryDelta,
        thermal: thermal ?? null,
        framesMeasured: measured,
        durationMs,
      };

      const { payload, ts } = buildPayload(config, deviceInfo, metrics, dryRun);

      const FileSystem = await loadExpoFileSystem();
      const directory = FileSystem?.documentDirectory ?? null;
      if (!FileSystem || !directory) {
        throw new Error('document directory unavailable');
      }
      const path = directory + 'bench_run.json';
      const benchRecord = {
        device: deviceInfo,
        config,
        metrics,
        dryRun,
        ts,
        payload,
      };
      await FileSystem.writeAsStringAsync(path, JSON.stringify(benchRecord, null, 2));

      setResult({
        metrics,
        dryRun,
        path,
        payload,
      });
      setStatus(`Saved ${measured} frames to ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Benchmark failed: ${message}`);
    } finally {
      setRunning(false);
    }
  }, [config, deviceInfo, modelAvailable, running]);

  const handleUpload = useCallback(async () => {
    if (!result || uploading) {
      return;
    }
    setUploading(true);
    setUploadStatus('Uploading…');
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
      const response = await fetch(`${API_BASE}/bench/edge`, {
        method: 'POST',
        headers,
        body: JSON.stringify(result.payload),
      });
      if (!response.ok) {
        throw new Error(`upload failed (${response.status})`);
      }
      setUploadStatus('Upload complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUploadStatus(`Upload failed: ${message}`);
    } finally {
      setUploading(false);
    }
  }, [result, uploading]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edge Device QA Bench</Text>
      <Text style={styles.subtitle}>
        {deviceInfo.device} • {deviceInfo.os} • v{deviceInfo.appVersion}
      </Text>
      {modelAvailable === false && (
        <Text style={styles.warning}>Model missing—run in dry mode.</Text>
      )}
      <View style={styles.section}>
        <OptionGroup
          label="Runtime"
          options={options.runtime}
          value={config.runtime}
          onSelect={(value) => setConfig((prev) => ({ ...prev, runtime: value }))}
        />
        <OptionGroup
          label="Input size"
          options={options.inputSize}
          value={config.inputSize}
          onSelect={(value) => setConfig((prev) => ({ ...prev, inputSize: value }))}
        />
        <OptionGroup
          label="Quant"
          options={options.quant}
          value={config.quant}
          onSelect={(value) => setConfig((prev) => ({ ...prev, quant: value }))}
        />
        <OptionGroup
          label="Threads"
          options={options.threads}
          value={config.threads}
          onSelect={(value) => setConfig((prev) => ({ ...prev, threads: value }))}
        />
        <OptionGroup
          label="Delegate"
          options={options.delegate}
          value={config.delegate}
          onSelect={(value) => setConfig((prev) => ({ ...prev, delegate: value }))}
        />
      </View>
      <TouchableOpacity
        style={[styles.button, running && styles.buttonDisabled]}
        onPress={runBenchmark}
        disabled={running}
      >
        <Text style={styles.buttonText}>{running ? 'Running…' : 'Run benchmark'}</Text>
      </TouchableOpacity>
      {status && <Text style={styles.status}>{status}</Text>}
      {result && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Latest run</Text>
          <Text style={styles.cardText}>
            Mode: {result.dryRun ? 'dry (synthetic)' : 'real (models detected)'}
          </Text>
          <Text style={styles.cardText}>FPS avg: {result.metrics.fpsAvg.toFixed(2)}</Text>
          <Text style={styles.cardText}>p50 latency: {result.metrics.p50.toFixed(2)} ms</Text>
          <Text style={styles.cardText}>p95 latency: {result.metrics.p95.toFixed(2)} ms</Text>
          <Text style={styles.cardText}>
            Memory Δ: {result.metrics.memDelta !== null ? `${result.metrics.memDelta} MB` : 'n/a'}
          </Text>
          <Text style={styles.cardText}>
            Battery Δ:{' '}
            {result.metrics.batteryDelta !== null
              ? `${result.metrics.batteryDelta.toFixed(2)}%`
              : 'n/a'}
          </Text>
          <Text style={styles.cardText}>
            Thermal: {result.metrics.thermal ? result.metrics.thermal : 'unknown'}
          </Text>
          <Text style={styles.cardText}>Frames: {result.metrics.framesMeasured}</Text>
          <Text style={styles.cardText}>
            Duration: {(result.metrics.durationMs / 1000).toFixed(1)} s
          </Text>
          <Text style={styles.cardPath}>{result.path}</Text>
          <TouchableOpacity
            style={[styles.button, uploading && styles.buttonDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            <Text style={styles.buttonText}>{uploading ? 'Uploading…' : 'Upload'}</Text>
          </TouchableOpacity>
          {uploadStatus && <Text style={styles.status}>{uploadStatus}</Text>}
        </View>
      )}
    </ScrollView>
  );
};

type OptionGroupProps<T> = {
  label: string;
  options: SelectionOption<T>[];
  value: T;
  onSelect: (value: T) => void;
};

function OptionGroup<T extends string | number>({
  label,
  options,
  value,
  onSelect,
}: OptionGroupProps<T>) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={String(option.value)}
              style={[styles.optionButton, selected && styles.optionButtonSelected]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[styles.optionButtonText, selected && styles.optionButtonTextSelected]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
  },
  warning: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    color: '#92400e',
  },
  section: {
    gap: 12,
  },
  button: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#f9fafb',
    fontWeight: '600',
  },
  status: {
    fontSize: 14,
    color: '#1f2937',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardText: {
    fontSize: 14,
    color: '#111827',
  },
  cardPath: {
    fontSize: 12,
    color: '#6b7280',
  },
  optionGroup: {
    gap: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  optionButtonSelected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  optionButtonText: {
    color: '#1f2937',
    fontWeight: '500',
  },
  optionButtonTextSelected: {
    color: '#f9fafb',
  },
});

export default QABenchScreen;
