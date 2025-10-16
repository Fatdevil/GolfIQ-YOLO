import type { EdgeDefaults, Platform } from './defaults';
import { fetchEdgeDefaults, getCachedEdgeDefaults } from './defaults';

type Runtime = EdgeDefaults['runtime'];
type Quant = EdgeDefaults['quant'];

const RUNTIMES: readonly Runtime[] = ['tflite', 'coreml', 'onnx', 'ncnn'];
const QUANTS: readonly Quant[] = ['int8', 'fp16', 'fp32'];

export interface ManifestModel {
  id: string;
  url: string;
  sha256: string;
  size: number;
  runtime: Runtime;
  inputSize: number;
  quant: Quant;
}

export interface Manifest {
  version: number;
  recommended?: Partial<Record<Platform, string>>;
  android?: ManifestModel[];
  ios?: ManifestModel[];
}

interface ManifestSection {
  models: ManifestModel[];
  recommended?: string;
}

type RcRecord = Record<string, unknown> | null | undefined;

type Storage = {
  root: string;
  join(...segments: string[]): string;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  removeFile(path: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
};

let manifestCache: Manifest | null = null;
let storageOverride: Storage | null = null;
let storagePromise: Promise<Storage> | null = null;

function getGlobalObject(): typeof globalThis & {
  EDGE_MODEL_MANIFEST_ENDPOINT?: string;
  EDGE_MODEL_BASE?: string;
  EDGE_DEFAULTS_BASE?: string;
  EDGE_MODEL_CACHE_DIR?: string;
  __EDGE_MODEL_CACHE_DIR__?: string;
  RC?: RcRecord;
} {
  return globalThis as typeof globalThis & {
    EDGE_MODEL_MANIFEST_ENDPOINT?: string;
    EDGE_MODEL_BASE?: string;
    EDGE_DEFAULTS_BASE?: string;
    EDGE_MODEL_CACHE_DIR?: string;
    __EDGE_MODEL_CACHE_DIR__?: string;
    RC?: RcRecord;
  };
}

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env ? env[key] : undefined;
}

function resolveManifestEndpoint(): string {
  const globalObject = getGlobalObject();
  const explicit =
    globalObject.EDGE_MODEL_MANIFEST_ENDPOINT ?? readEnv('EDGE_MODEL_MANIFEST_ENDPOINT');
  if (explicit) {
    return explicit.trim();
  }
  const base =
    globalObject.EDGE_MODEL_BASE ??
    globalObject.EDGE_DEFAULTS_BASE ??
    readEnv('EDGE_MODEL_BASE') ??
    readEnv('EDGE_DEFAULTS_BASE') ??
    readEnv('EXPO_PUBLIC_API_BASE') ??
    readEnv('API_BASE') ??
    '';
  const trimmed = base.trim().replace(/\/+$/, '');
  return trimmed ? `${trimmed}/models/manifest.json` : '/models/manifest.json';
}

function toHex(input: ArrayBuffer | Uint8Array): string {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  let output = '';
  for (let i = 0; i < view.length; i += 1) {
    output += view[i].toString(16).padStart(2, '0');
  }
  return output;
}

async function computeSha256(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const alignedBuffer =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data.buffer
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', alignedBuffer);
    return toHex(digest);
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { createHash } = (await import('node:crypto')) as typeof import('node:crypto');
      const hash = createHash('sha256');
      hash.update(data);
      return hash.digest('hex');
    } catch (error) {
      try {
        const { createHash } = (await import('crypto')) as typeof import('crypto');
        const hash = createHash('sha256');
        hash.update(data);
        return hash.digest('hex');
      } catch {
        // fall through
      }
    }
  }
  throw new Error('SHA-256 digest is not available in this environment');
}

function normalizeRuntime(value: unknown): Runtime | null {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return (RUNTIMES as readonly string[]).includes(lower)
    ? (lower as Runtime)
    : null;
}

function normalizeQuant(value: unknown): Quant | null {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return (QUANTS as readonly string[]).includes(lower) ? (lower as Quant) : null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeSha(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(lower) ? lower : null;
}

function normalizeSize(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

function normalizeInputSize(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

function normalizeModel(value: unknown): ManifestModel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const id = normalizeId(data.id);
  const url = normalizeUrl(data.url);
  const sha256 = normalizeSha(data.sha256);
  const size = normalizeSize(data.size);
  const runtime = normalizeRuntime(data.runtime);
  const inputSize = normalizeInputSize(data.inputSize);
  const quant = normalizeQuant(data.quant);
  if (!id || !url || !sha256 || size === null || !runtime || inputSize === null || !quant) {
    return null;
  }
  return { id, url, sha256, size, runtime, inputSize, quant };
}

function extractModels(section: unknown): ManifestSection | null {
  if (!section) {
    return null;
  }
  if (Array.isArray(section)) {
    const models = section.map((item) => normalizeModel(item)).filter(Boolean) as ManifestModel[];
    return models.length ? { models } : null;
  }
  if (typeof section === 'object') {
    const data = section as Record<string, unknown>;
    const modelsValue = data.models ?? data.entries ?? data.list;
    const models = Array.isArray(modelsValue)
      ? (modelsValue.map((item) => normalizeModel(item)).filter(Boolean) as ManifestModel[])
      : [];
    const recommended = typeof data.recommended === 'string' ? data.recommended.trim() : undefined;
    return models.length ? { models, recommended: recommended || undefined } : null;
  }
  return null;
}

function mergeRecommended(
  manifestRecommended: Partial<Record<Platform, string>> | undefined,
  sectionRecommended: string | undefined,
  platform: Platform,
): Partial<Record<Platform, string>> | undefined {
  const value = sectionRecommended?.trim();
  if (!value) {
    return manifestRecommended;
  }
  const next = manifestRecommended ? { ...manifestRecommended } : {};
  next[platform] = value;
  return next;
}

function normalizeRecommended(raw: unknown): Partial<Record<Platform, string>> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const data = raw as Record<string, unknown>;
  const result: Partial<Record<Platform, string>> = {};
  for (const key of Object.keys(data)) {
    const lower = key.trim().toLowerCase();
    if (lower === 'android' || lower === 'ios') {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        result[lower as Platform] = value.trim();
      }
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function cloneModels(models: ManifestModel[] | undefined): ManifestModel[] | undefined {
  if (!models) {
    return undefined;
  }
  return models.map((model) => ({ ...model }));
}

function cloneManifest(manifest: Manifest): Manifest {
  const recommended = manifest.recommended ? { ...manifest.recommended } : undefined;
  return {
    version: manifest.version,
    recommended,
    android: cloneModels(manifest.android),
    ios: cloneModels(manifest.ios),
  };
}

function normalizeManifest(payload: unknown): Manifest {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Manifest payload is not an object');
  }
  const data = payload as Record<string, unknown>;
  const versionRaw = data.version;
  const version = typeof versionRaw === 'number' ? Math.floor(versionRaw) : Number(versionRaw);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error('Manifest version is invalid');
  }
  let recommended = normalizeRecommended(data.recommended);

  const androidSection = extractModels(data.android);
  if (androidSection?.recommended) {
    recommended = mergeRecommended(recommended, androidSection.recommended, 'android');
  }
  const iosSection = extractModels(data.ios);
  if (iosSection?.recommended) {
    recommended = mergeRecommended(recommended, iosSection.recommended, 'ios');
  }

  const manifest: Manifest = {
    version,
    recommended,
  };
  if (androidSection) {
    manifest.android = androidSection.models;
  }
  if (iosSection) {
    manifest.ios = iosSection.models;
  }
  if (!manifest.android && !manifest.ios) {
    throw new Error('Manifest does not contain any platform entries');
  }
  return manifest;
}

async function fetchManifest(signal?: AbortSignal): Promise<Manifest> {
  const response = await fetch(resolveManifestEndpoint(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest (${response.status})`);
  }
  const payload = (await response.json()) as unknown;
  return normalizeManifest(payload);
}

function getRc(): RcRecord {
  const globalObject = getGlobalObject();
  return globalObject.RC ?? undefined;
}

function readRcString(key: string): string | undefined {
  const rc = getRc();
  if (!rc || typeof rc !== 'object') {
    return undefined;
  }
  const value = (rc as Record<string, unknown>)[key];
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return undefined;
}

function readRcBoolean(key: string): boolean {
  const value = readRcString(key);
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'model';
}

function fileExtensionFromUrl(url: string): string {
  const withoutQuery = url.split('?')[0].split('#')[0];
  const slashIndex = withoutQuery.lastIndexOf('/');
  const fileName = slashIndex >= 0 ? withoutQuery.slice(slashIndex + 1) : withoutQuery;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return '';
  }
  const ext = fileName.slice(dotIndex);
  return ext.length <= 16 ? ext : '';
}

async function downloadModel(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { method: 'GET', signal });
  if (!response.ok) {
    throw new Error(`Failed to download model (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function resolveNodeStorage(): Promise<Storage | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }
  try {
    const fs = ((await import('node:fs/promises')) as typeof import('node:fs/promises'));
    const pathModule = ((await import('node:path')) as typeof import('node:path'));
    const globalObject = getGlobalObject();
    const configured =
      globalObject.__EDGE_MODEL_CACHE_DIR__ ??
      globalObject.EDGE_MODEL_CACHE_DIR ??
      readEnv('EDGE_MODEL_CACHE_DIR');
    const baseDir = configured
      ? configured
      : pathModule.join(process.cwd(), '.edge-models');
    await fs.mkdir(baseDir, { recursive: true });
    return {
      root: baseDir,
      join: (...segments: string[]) => pathModule.join(baseDir, ...segments),
      ensureDir: async (path: string) => {
        await fs.mkdir(pathModule.dirname(path), { recursive: true });
      },
      readFile: async (path: string) => {
        try {
          const data = await fs.readFile(path);
          return new Uint8Array(data);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      },
      writeFile: async (path: string, data: Uint8Array) => {
        await fs.mkdir(pathModule.dirname(path), { recursive: true });
        await fs.writeFile(path, data);
      },
      removeFile: async (path: string) => {
        try {
          await fs.unlink(path);
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
            return;
          }
          throw error;
        }
      },
      exists: async (path: string) => {
        try {
          const stats = await fs.stat(path);
          return stats.isFile();
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      },
    } satisfies Storage;
  } catch {
    return null;
  }
}

function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < data.length; i += 1) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }
  throw new Error('Base64 encoding not supported');
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Base64 decoding not supported');
}

async function resolveExpoStorage(): Promise<Storage | null> {
  try {
    const FileSystem = (await import('expo-file-system')) as Record<string, unknown> & {
      documentDirectory?: string | null;
      getInfoAsync?(path: string): Promise<{ exists: boolean; isFile: boolean }>;
      makeDirectoryAsync?(path: string, options?: { intermediates?: boolean }): Promise<void>;
      readAsStringAsync?(path: string, options?: { encoding?: string }): Promise<string>;
      writeAsStringAsync?(path: string, contents: string, options?: { encoding?: string }): Promise<void>;
      deleteAsync?(path: string, options?: { idempotent?: boolean }): Promise<void>;
    };
    if (!FileSystem || typeof FileSystem !== 'object') {
      return null;
    }
    const base = FileSystem.documentDirectory;
    if (!base || typeof base !== 'string') {
      return null;
    }
    const root = `${base.replace(/\/+$/, '')}/edge-models`;
    const ensureDirectory = async (target: string) => {
      if (FileSystem.makeDirectoryAsync) {
        await FileSystem.makeDirectoryAsync(target, { intermediates: true });
      }
    };
    const getInfo = FileSystem.getInfoAsync
      ? FileSystem.getInfoAsync.bind(FileSystem)
      : async () => ({ exists: false, isFile: false });
    const readString = FileSystem.readAsStringAsync
      ? FileSystem.readAsStringAsync.bind(FileSystem)
      : async () => '';
    const writeString = FileSystem.writeAsStringAsync
      ? FileSystem.writeAsStringAsync.bind(FileSystem)
      : async () => undefined;
    const deleteAsync = FileSystem.deleteAsync ? FileSystem.deleteAsync.bind(FileSystem) : null;
    return {
      root,
      join: (...segments: string[]) => {
        const cleaned = segments.map((segment) => segment.replace(/^\/+|\/+$/g, ''));
        return [root, ...cleaned].join('/');
      },
      ensureDir: async (path: string) => {
        const dir = path.replace(/\/+[^/]*$/, '');
        if (dir) {
          await ensureDirectory(dir);
        }
      },
      readFile: async (path: string) => {
        const info = await getInfo(path);
        if (!info.exists || !info.isFile) {
          return null;
        }
        const contents = await readString(path, { encoding: 'base64' });
        return decodeBase64(contents);
      },
      writeFile: async (path: string, data: Uint8Array) => {
        const dir = path.replace(/\/+[^/]*$/, '');
        if (dir) {
          await ensureDirectory(dir);
        }
        const base64 = encodeBase64(data);
        await writeString(path, base64, { encoding: 'base64' });
      },
      removeFile: async (path: string) => {
        if (deleteAsync) {
          await deleteAsync(path, { idempotent: true });
        }
      },
      exists: async (path: string) => {
        const info = await getInfo(path);
        return !!(info.exists && info.isFile);
      },
    } satisfies Storage;
  } catch {
    return null;
  }
}

async function getStorage(): Promise<Storage> {
  if (storageOverride) {
    return storageOverride;
  }
  if (!storagePromise) {
    storagePromise = (async () => {
      const expo = await resolveExpoStorage();
      if (expo) {
        return expo;
      }
      const nodeStorage = await resolveNodeStorage();
      if (nodeStorage) {
        return nodeStorage;
      }
      throw new Error('No storage backend available for model caching');
    })();
  }
  return storagePromise;
}

function findModelById(section: ManifestSection, id: string): ManifestModel | null {
  return section.models.find((model) => model.id === id) ?? null;
}

async function pickModelFromDefaults(
  platform: Platform,
  section: ManifestSection,
  enforce: boolean,
): Promise<ManifestModel | null> {
  if (!section.models.length) {
    return null;
  }
  if (!enforce) {
    const cached = await getCachedEdgeDefaults(platform);
    if (cached) {
      const match = section.models.find(
        (model) =>
          model.runtime === cached.runtime &&
          model.inputSize === cached.inputSize &&
          model.quant === cached.quant,
      );
      if (match) {
        return match;
      }
    }
  }
  try {
    const defaults = await fetchEdgeDefaults({ platform });
    const candidate = defaults[platform];
    if (candidate) {
      const match = section.models.find(
        (model) =>
          model.runtime === candidate.runtime &&
          model.inputSize === candidate.inputSize &&
          model.quant === candidate.quant,
      );
      if (match) {
        return match;
      }
    }
  } catch {
    // ignore fetch failures
  }
  return null;
}

function getSection(manifest: Manifest, platform: Platform): ManifestSection {
  const models = platform === 'android' ? manifest.android : manifest.ios;
  if (!models || !models.length) {
    throw new Error(`Manifest missing models for ${platform}`);
  }
  const recommended = manifest.recommended?.[platform];
  return { models: models.map((model) => ({ ...model })), recommended };
}

async function selectModel(
  platform: Platform,
  manifest: Manifest,
  explicitId?: string,
): Promise<ManifestModel> {
  const section = getSection(manifest, platform);
  const rcPinned = readRcString('edge.model.pinnedId');
  if (rcPinned) {
    const pinned = findModelById(section, rcPinned);
    if (pinned) {
      return { ...pinned };
    }
    throw new Error(`Pinned model ${rcPinned} not found in manifest`);
  }
  const rcEnforce = readRcBoolean('edge.defaults.enforce');
  if (explicitId && !rcEnforce) {
    const explicit = findModelById(section, explicitId);
    if (explicit) {
      return { ...explicit };
    }
  }
  const fromDefaults = await pickModelFromDefaults(platform, section, rcEnforce);
  if (fromDefaults) {
    return { ...fromDefaults };
  }
  const recommendedId = explicitId ?? section.recommended;
  if (recommendedId) {
    const recommended = findModelById(section, recommendedId);
    if (recommended) {
      return { ...recommended };
    }
  }
  return { ...section.models[0] };
}

export async function getManifest(opts?: { signal?: AbortSignal; refresh?: boolean }): Promise<Manifest> {
  if (!manifestCache || opts?.refresh) {
    manifestCache = await fetchManifest(opts?.signal);
  }
  return cloneManifest(manifestCache);
}

export async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  const storage = await getStorage();
  const normalized = expected.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return false;
  }
  const data = await storage.readFile(filePath);
  if (!data) {
    return false;
  }
  const digest = await computeSha256(data);
  return digest === normalized;
}

export async function ensureModel(opts: {
  platform: Platform;
  id?: string;
  signal?: AbortSignal;
}): Promise<{ path: string }> {
  const manifest = await getManifest({ signal: opts.signal });
  const model = await selectModel(opts.platform, manifest, opts.id);
  const storage = await getStorage();
  const extension = fileExtensionFromUrl(model.url);
  const fileName = `${sanitizeSegment(model.id)}${extension}`;
  const destination = storage.join(opts.platform, fileName);
  if (await storage.exists(destination)) {
    const ok = await verifySha256(destination, model.sha256);
    if (ok) {
      return { path: destination };
    }
    await storage.removeFile(destination);
  }
  const payload = await downloadModel(model.url, opts.signal);
  const digest = await computeSha256(payload);
  if (digest !== model.sha256) {
    throw new Error('Downloaded model failed integrity check');
  }
  await storage.writeFile(destination, payload);
  const verified = await verifySha256(destination, model.sha256);
  if (!verified) {
    await storage.removeFile(destination);
    throw new Error('Stored model failed integrity verification');
  }
  return { path: destination };
}

export function __setEdgeModelStorageForTests(storage: Storage | null): void {
  storageOverride = storage;
  storagePromise = null;
}

export function __resetEdgeModelLoaderForTests(): void {
  manifestCache = null;
  storagePromise = null;
  storageOverride = null;
}
