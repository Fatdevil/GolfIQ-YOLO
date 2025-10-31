import { getItem, removeItem, setItem } from '../core/pstore';

export type LruConfig = { maxBytes: number; highWatermark: number };

type IndexEntry = { key: string; bytes: number; lastAccess: number };

type IndexRecord = {
  totalBytes: number;
  entries: Record<string, IndexEntry>;
};

const DEFAULT_CFG: LruConfig = {
  maxBytes: 150 * 1024 * 1024,
  highWatermark: 120 * 1024 * 1024,
};

const INDEX_KEY = '@bundles/index.v1';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const len = bytes.length;
  let result = '';
  let i = 0;
  while (i + 2 < len) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
      BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
      BASE64_ALPHABET[(triplet >> 6) & 0x3f] +
      BASE64_ALPHABET[triplet & 0x3f];
    i += 3;
  }
  if (i < len) {
    const remaining = len - i;
    let triplet = bytes[i] << 16;
    if (remaining === 2) {
      triplet |= bytes[i + 1] << 8;
    }
    result += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    result += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    if (remaining === 2) {
      result += BASE64_ALPHABET[(triplet >> 6) & 0x3f];
      result += '=';
    } else {
      result += '==';
    }
  }
  return result;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLength = Math.max(((clean.length * 3) >> 2) - padding, 0);
  const bytes = new Uint8Array(outputLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;
    if (char === '=') {
      break;
    }
    const valueIndex = BASE64_ALPHABET.indexOf(char);
    if (valueIndex < 0) {
      continue;
    }
    buffer = (buffer << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
      buffer &= (1 << bits) - 1;
    }
  }
  return bytes;
}

function now(): number {
  return Date.now();
}

function normalizeConfig(cfg?: Partial<LruConfig>): LruConfig {
  const maxBytes = cfg?.maxBytes && cfg.maxBytes > 0 ? cfg.maxBytes : DEFAULT_CFG.maxBytes;
  let highWatermark = cfg?.highWatermark && cfg.highWatermark > 0 ? cfg.highWatermark : DEFAULT_CFG.highWatermark;
  if (highWatermark > maxBytes) {
    highWatermark = maxBytes;
  }
  return { maxBytes, highWatermark };
}

function createEmptyIndex(): IndexRecord {
  return { totalBytes: 0, entries: {} };
}

function computeTotalBytes(entries: Record<string, IndexEntry>): number {
  let total = 0;
  for (const entry of Object.values(entries)) {
    total += entry.bytes;
  }
  return total;
}

async function loadIndexFromStorage(): Promise<IndexRecord> {
  const raw = await getItem(INDEX_KEY);
  if (!raw) {
    return createEmptyIndex();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<IndexRecord>;
    if (!parsed || typeof parsed !== 'object') {
      return createEmptyIndex();
    }
    const entries: Record<string, IndexEntry> = {};
    if (parsed.entries && typeof parsed.entries === 'object') {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (!value || typeof value !== 'object') {
          continue;
        }
        const bytes = Number((value as IndexEntry).bytes);
        const lastAccess = Number((value as IndexEntry).lastAccess);
        if (!Number.isFinite(bytes) || bytes < 0 || !Number.isFinite(lastAccess)) {
          continue;
        }
        entries[key] = { key, bytes, lastAccess };
      }
    }
    const totalBytes = computeTotalBytes(entries);
    return { totalBytes, entries };
  } catch {
    return createEmptyIndex();
  }
}

export class BundleStore {
  private readonly config: LruConfig;

  private indexPromise: Promise<IndexRecord> | null = null;

  private queue: Promise<void> = Promise.resolve();

  constructor(cfg?: Partial<LruConfig>) {
    this.config = normalizeConfig(cfg);
  }

  private async loadIndex(): Promise<IndexRecord> {
    if (!this.indexPromise) {
      this.indexPromise = loadIndexFromStorage();
    }
    return this.indexPromise;
  }

  private async persistIndex(index: IndexRecord): Promise<void> {
    index.totalBytes = computeTotalBytes(index.entries);
    this.indexPromise = Promise.resolve(index);
    await setItem(INDEX_KEY, JSON.stringify(index));
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private dataKey(key: string): string {
    return `bundle:${key}`;
  }

  private async evict(index: IndexRecord): Promise<void> {
    const threshold = Math.min(this.config.highWatermark, this.config.maxBytes);
    if (threshold <= 0) {
      return;
    }
    while (index.totalBytes > threshold && Object.keys(index.entries).length > 0) {
      let oldestKey: string | null = null;
      let oldestAccess = Number.POSITIVE_INFINITY;
      for (const entry of Object.values(index.entries)) {
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = entry.key;
        }
      }
      if (!oldestKey) {
        break;
      }
      const entry = index.entries[oldestKey];
      delete index.entries[oldestKey];
      index.totalBytes -= entry.bytes;
      if (index.totalBytes < 0) {
        index.totalBytes = computeTotalBytes(index.entries);
      }
      await removeItem(this.dataKey(oldestKey));
    }
    index.totalBytes = computeTotalBytes(index.entries);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.runExclusive(async () => {
      const index = await this.loadIndex();
      const entry = index.entries[key];
      if (!entry) {
        return undefined;
      }
      const stored = await getItem(this.dataKey(key));
      if (!stored) {
        delete index.entries[key];
        await this.persistIndex(index);
        return undefined;
      }
      entry.lastAccess = now();
      await this.persistIndex(index);
      return decodeBase64(stored);
    });
  }

  async set(key: string, data: Uint8Array, bytes: number): Promise<void> {
    await this.runExclusive(async () => {
      const index = await this.loadIndex();
      if (bytes > this.config.maxBytes) {
        delete index.entries[key];
        await removeItem(this.dataKey(key));
        await this.persistIndex(index);
        return;
      }
      const encoded = encodeBase64(data);
      await setItem(this.dataKey(key), encoded);
      index.entries[key] = { key, bytes, lastAccess: now() };
      index.totalBytes = computeTotalBytes(index.entries);
      await this.evict(index);
      await this.persistIndex(index);
    });
  }

  async del(key: string): Promise<void> {
    await this.runExclusive(async () => {
      const index = await this.loadIndex();
      if (!index.entries[key]) {
        await removeItem(this.dataKey(key));
        return;
      }
      delete index.entries[key];
      await removeItem(this.dataKey(key));
      await this.persistIndex(index);
    });
  }

  async stat(key: string): Promise<{ bytes: number } | undefined> {
    await this.queue;
    const index = await this.loadIndex();
    const entry = index.entries[key];
    if (!entry) {
      return undefined;
    }
    return { bytes: entry.bytes };
  }
}
