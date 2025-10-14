export type EdgeRuntime = 'tflite' | 'coreml' | 'onnx' | 'ncnn';
export type EdgeQuant = 'int8' | 'fp16' | 'fp32';
export type EdgeDelegate = 'cpu' | 'nnapi' | 'gpu';
export type EdgePlatform = 'android' | 'ios';

export type EdgeDefaultsConfig = {
  runtime: string;
  inputSize: number;
  quant: string;
  threads: number;
  delegate?: string;
};

export type EdgeDefaultsMap = Partial<Record<EdgePlatform, EdgeDefaultsConfig>>;

type ExpoFileSystemModule = {
  documentDirectory?: string | null;
  getInfoAsync(path: string): Promise<{ exists: boolean; isFile: boolean }>;
  readAsStringAsync(path: string): Promise<string>;
  writeAsStringAsync(path: string, contents: string): Promise<void>;
};

let embeddedCache: EdgeDefaultsMap | null | undefined;

async function loadExpoFileSystem(): Promise<ExpoFileSystemModule | null> {
  try {
    const mod = (await import('expo-file-system')) as ExpoFileSystemModule;
    return mod ?? null;
  } catch (error) {
    return null;
  }
}

function isEdgeDefaultsConfig(value: unknown): value is EdgeDefaultsConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Record<string, unknown>;
  if (typeof data.runtime !== 'string') {
    return false;
  }
  if (typeof data.quant !== 'string') {
    return false;
  }
  if (typeof data.inputSize !== 'number' || !Number.isFinite(data.inputSize)) {
    return false;
  }
  if (typeof data.threads !== 'number' || !Number.isFinite(data.threads)) {
    return false;
  }
  if (
    'delegate' in data &&
    data.delegate !== undefined &&
    data.delegate !== null &&
    typeof data.delegate !== 'string'
  ) {
    return false;
  }
  return true;
}

function normalizeConfig(config: EdgeDefaultsConfig): EdgeDefaultsConfig {
  const result: EdgeDefaultsConfig = {
    runtime: String(config.runtime).toLowerCase(),
    inputSize: Math.round(Number(config.inputSize)),
    quant: String(config.quant).toLowerCase(),
    threads: Math.max(1, Math.round(Number(config.threads))),
  };
  if (config.delegate !== undefined) {
    const cleaned = String(config.delegate).toLowerCase().trim();
    if (cleaned) {
      result.delegate = cleaned;
    }
  }
  return result;
}

const PLATFORMS: EdgePlatform[] = ['android', 'ios'];

function cloneDefaults(value: EdgeDefaultsMap): EdgeDefaultsMap {
  const output: EdgeDefaultsMap = {};
  for (const platform of PLATFORMS) {
    const cfg = value[platform];
    if (cfg && isEdgeDefaultsConfig(cfg)) {
      output[platform] = normalizeConfig(cfg);
    }
  }
  return output;
}

function loadEmbeddedDefaults(): EdgeDefaultsMap | null {
  if (embeddedCache !== undefined) {
    return embeddedCache;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const raw = require('../../../models/edge_defaults.json') as unknown;
    if (raw && typeof raw === 'object') {
      embeddedCache = cloneDefaults(raw as EdgeDefaultsMap);
    } else {
      embeddedCache = null;
    }
  } catch (error) {
    embeddedCache = null;
  }
  return embeddedCache;
}

export function getEmbeddedEdgeDefaults(): EdgeDefaultsMap | null {
  const embedded = loadEmbeddedDefaults();
  if (!embedded) {
    return null;
  }
  return cloneDefaults(embedded);
}

export async function readEdgeDefaults(): Promise<EdgeDefaultsMap | null> {
  const FileSystem = await loadExpoFileSystem();
  if (FileSystem?.documentDirectory) {
    const path = FileSystem.documentDirectory + 'edge_defaults.json';
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists && info.isFile) {
        const contents = await FileSystem.readAsStringAsync(path);
        const parsed = JSON.parse(contents) as unknown;
        if (parsed && typeof parsed === 'object') {
          const normalized = cloneDefaults(parsed as EdgeDefaultsMap);
          return normalized && Object.keys(normalized).length > 0
            ? normalized
            : getEmbeddedEdgeDefaults();
        }
      }
    } catch (error) {
      // fall back to embedded defaults
    }
  }
  return getEmbeddedEdgeDefaults();
}

export function pickDefaultsForPlatform(
  defaults: EdgeDefaultsMap | null,
  platform: EdgePlatform,
): EdgeDefaultsConfig | null {
  if (!defaults) {
    return null;
  }
  const value = defaults[platform];
  if (!value) {
    return null;
  }
  return normalizeConfig(value);
}
