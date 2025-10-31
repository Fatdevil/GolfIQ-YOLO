import { getItem, setItem } from '../core/pstore';
import { emitBundleTelemetry, type BundleTelemetryEmitter } from '../telemetry/bundles';
import { equalB64, sha256Base64 } from './integrity';
import { BundleStore } from './store';
import type { BundleResult, CourseBundleManifest, HoleRef } from './types';

type InternalBundleResult = BundleResult & { bytes?: number };

type FetchManifestResult =
  | { status: 'ok'; manifest: CourseBundleManifest }
  | { status: 'not-modified'; etag?: string }
  | { status: 'error'; reason: string };

type FetchBundleResult =
  | { status: 'ok'; data: Uint8Array }
  | { status: 'invalid'; reason: string }
  | { status: 'error'; reason: string };

export type ClientCfg = {
  baseUrl: string;
  ttlDefaultSec: number;
  fetchImpl?: typeof fetch;
  clock?: () => number;
  telemetryEmitter?: BundleTelemetryEmitter | null;
  telemetryEnabled?: boolean;
};

const MANIFEST_KEY_PREFIX = '@bundles/manifest:';

function sanitizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, '');
}

function ensurePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function toHoleRef(value: unknown): HoleRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null;
  const versionRaw = (value as { v?: unknown }).v;
  const lenRaw = (value as { len?: unknown }).len;
  const v = Number(versionRaw);
  const len = Number(lenRaw);
  if (!id || !Number.isFinite(v) || !Number.isFinite(len) || len < 0) {
    return null;
  }
  return { id, v, len };
}

export class BundleClient {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  private readonly clock: () => number;

  private readonly telemetryEmitter: BundleTelemetryEmitter | null;

  private readonly telemetryEnabled: boolean;

  constructor(private readonly store: BundleStore, cfg: ClientCfg) {
    this.baseUrl = sanitizeBaseUrl(cfg.baseUrl);
    const fetchCandidate = cfg.fetchImpl ?? globalThis.fetch;
    if (typeof fetchCandidate !== 'function') {
      throw new Error('BundleClient requires a fetch implementation');
    }
    this.fetchImpl = cfg.fetchImpl ?? fetchCandidate.bind(globalThis);
    this.clock = cfg.clock ?? Date.now;
    this.telemetryEmitter = cfg.telemetryEmitter ?? null;
    this.telemetryEnabled = Boolean(cfg.telemetryEnabled);
    this.ttlDefaultSec = ensurePositive(cfg.ttlDefaultSec, 60);
  }

  private readonly ttlDefaultSec: number;

  private now(): number {
    return this.clock();
  }

  private manifestStorageKey(courseId: string): string {
    return `${MANIFEST_KEY_PREFIX}${courseId}`;
  }

  private bundleKey(manifest: CourseBundleManifest): string {
    return `course:${manifest.id}:v:${manifest.v}`;
  }

  private manifestUrl(courseId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(courseId)}/manifest.json`;
  }

  private bundleUrl(courseId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(courseId)}/bundle.bin`;
  }

  private normalizeManifest(
    raw: unknown,
    courseId: string,
    etag?: string | null,
    fallbackUpdatedAt?: number,
  ): CourseBundleManifest {
    const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const id = typeof source.id === 'string' && source.id ? source.id : courseId;
    const versionRaw = source.v;
    const ttlRaw = source.ttlSec;
    const updatedAtRaw = source.updatedAt;
    const sha = typeof source.sha256 === 'string' ? source.sha256 : undefined;
    const sizeRaw = source.sizeBytes;
    const v = Number(versionRaw);
    if (!Number.isFinite(v)) {
      throw new Error('Manifest missing version');
    }
    const ttlSec = ensurePositive(Number(ttlRaw), this.ttlDefaultSec);
    const updatedAtCandidate = Number(updatedAtRaw);
    const updatedAt = Number.isFinite(updatedAtCandidate) && updatedAtCandidate > 0 ? updatedAtCandidate : fallbackUpdatedAt ?? this.now();
    const sizeCandidate = Number(sizeRaw);
    const sizeBytes = Number.isFinite(sizeCandidate) && sizeCandidate >= 0 ? sizeCandidate : 0;
    const holesSource = Array.isArray(source.holes) ? source.holes : [];
    const holes: HoleRef[] = [];
    for (const entry of holesSource) {
      const normalized = toHoleRef(entry);
      if (normalized) {
        holes.push(normalized);
      }
    }
    return {
      id,
      v,
      etag: typeof etag === 'string' && etag.length > 0 ? etag : typeof source.etag === 'string' ? source.etag : undefined,
      updatedAt,
      ttlSec,
      sha256: sha,
      sizeBytes,
      holes,
    };
  }

  private async loadManifest(courseId: string): Promise<CourseBundleManifest | undefined> {
    const stored = await getItem(this.manifestStorageKey(courseId));
    if (!stored) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(stored) as unknown;
      const manifest = this.normalizeManifest(parsed, courseId, (parsed as { etag?: string })?.etag);
      return manifest;
    } catch {
      return undefined;
    }
  }

  private async saveManifest(courseId: string, manifest: CourseBundleManifest): Promise<void> {
    await setItem(this.manifestStorageKey(courseId), JSON.stringify(manifest));
  }

  private isStale(manifest: CourseBundleManifest, referenceTs: number): boolean {
    const ttl = ensurePositive(manifest.ttlSec, this.ttlDefaultSec);
    const expiry = manifest.updatedAt + ttl * 1000;
    return expiry <= referenceTs;
  }

  private async fetchManifest(
    courseId: string,
    previous: CourseBundleManifest | undefined,
  ): Promise<FetchManifestResult> {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (previous?.etag) {
      headers.set('If-None-Match', previous.etag);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.manifestUrl(courseId), { headers });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Manifest request failed';
      return { status: 'error', reason };
    }
    if (response.status === 304) {
      return { status: 'not-modified', etag: response.headers.get('ETag') ?? undefined };
    }
    if (!response.ok) {
      return { status: 'error', reason: `Manifest request failed (${response.status})` };
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { status: 'error', reason: 'Manifest parse failed' };
    }
    try {
      const manifest = this.normalizeManifest(json, courseId, response.headers.get('ETag'));
      return { status: 'ok', manifest };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid manifest';
      return { status: 'error', reason };
    }
  }

  private async downloadBundle(courseId: string, manifest: CourseBundleManifest): Promise<FetchBundleResult> {
    const headers = new Headers();
    headers.set('Accept', 'application/octet-stream');
    let response: Response;
    try {
      response = await this.fetchImpl(this.bundleUrl(courseId), { headers });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Bundle request failed';
      return { status: 'error', reason };
    }
    if (!response.ok) {
      return { status: 'error', reason: `Bundle request failed (${response.status})` };
    }
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch {
      return { status: 'error', reason: 'Failed to read bundle payload' };
    }
    const data = new Uint8Array(arrayBuffer);
    if (manifest.sha256) {
      const digest = await sha256Base64(data);
      if (!equalB64(digest, manifest.sha256)) {
        return { status: 'invalid', reason: 'SHA-256 mismatch' };
      }
    }
    return { status: 'ok', data };
  }

  private emitTelemetry(
    courseId: string,
    result: InternalBundleResult,
    startedAt: number,
  ): void {
    if (!this.telemetryEnabled) {
      return;
    }
    const manifest = result.manifest;
    emitBundleTelemetry(
      this.telemetryEmitter,
      {
        courseId,
        result: result.status,
        bytes: result.bytes,
        etag: manifest?.etag,
        ttlSec: manifest?.ttlSec,
        tookMs: this.now() - startedAt,
      },
      { enabled: true },
    );
  }

  private async refreshInternal(
    courseId: string,
    previous: CourseBundleManifest | undefined,
  ): Promise<InternalBundleResult> {
    const manifestResult = await this.fetchManifest(courseId, previous);
    if (manifestResult.status === 'error') {
      if (previous) {
        const previousKey = this.bundleKey(previous);
        const stat = await this.store.stat(previousKey);
        return { status: 'error', manifest: previous, path: previousKey, reason: manifestResult.reason, bytes: stat?.bytes };
      }
      return { status: 'error', reason: manifestResult.reason };
    }

    if (manifestResult.status === 'not-modified') {
      if (!previous) {
        return { status: 'missing', reason: 'No cached manifest for 304 response' };
      }
      const updated: CourseBundleManifest = {
        ...previous,
        etag: manifestResult.etag ?? previous.etag,
        updatedAt: this.now(),
      };
      await this.saveManifest(courseId, updated);
      const key = this.bundleKey(updated);
      const stat = await this.store.stat(key);
      if (stat) {
        return { status: 'fresh', manifest: updated, path: key, bytes: stat.bytes };
      }
      const bundleResult = await this.downloadBundle(courseId, updated);
      if (bundleResult.status !== 'ok') {
        if (previous) {
          await this.saveManifest(courseId, previous);
        }
        return {
          status: bundleResult.status,
          manifest: previous,
          path: key,
          reason: bundleResult.reason,
        };
      }
      const data = bundleResult.data;
      await this.store.set(key, data, data.byteLength);
      const manifestToStore: CourseBundleManifest = { ...updated, sizeBytes: data.byteLength };
      await this.saveManifest(courseId, manifestToStore);
      return { status: 'fresh', manifest: manifestToStore, path: key, bytes: data.byteLength };
    }

    const nextManifest = manifestResult.manifest;
    const key = this.bundleKey(nextManifest);
    const existing = await this.store.stat(key);
    if (existing) {
      const storedManifest: CourseBundleManifest = { ...nextManifest, sizeBytes: existing.bytes };
      await this.saveManifest(courseId, storedManifest);
      return { status: 'fresh', manifest: storedManifest, path: key, bytes: existing.bytes };
    }
    const bundleResult = await this.downloadBundle(courseId, nextManifest);
    if (bundleResult.status !== 'ok') {
      if (previous) {
        const previousKey = this.bundleKey(previous);
        const stat = await this.store.stat(previousKey);
        return {
          status: bundleResult.status,
          manifest: previous,
          path: previousKey,
          reason: bundleResult.reason,
          bytes: stat?.bytes,
        };
      }
      return { status: bundleResult.status, reason: bundleResult.reason };
    }
    const data = bundleResult.data;
    await this.store.set(key, data, data.byteLength);
    const manifestToStore: CourseBundleManifest = {
      ...nextManifest,
      updatedAt: nextManifest.updatedAt ?? this.now(),
      ttlSec: ensurePositive(nextManifest.ttlSec, this.ttlDefaultSec),
      sizeBytes: data.byteLength,
    };
    await this.saveManifest(courseId, manifestToStore);
    return { status: 'fresh', manifest: manifestToStore, path: key, bytes: data.byteLength };
  }

  async manifest(courseId: string): Promise<{ manifest?: CourseBundleManifest; stale: boolean }> {
    const normalizedId = courseId.trim();
    const manifest = await this.loadManifest(normalizedId);
    if (!manifest) {
      return { manifest: undefined, stale: true };
    }
    const stale = this.isStale(manifest, this.now());
    return { manifest, stale };
  }

  async ensure(courseId: string): Promise<BundleResult> {
    const normalizedId = courseId.trim();
    const startedAt = this.now();
    const currentManifest = await this.loadManifest(normalizedId);
    const currentKey = currentManifest ? this.bundleKey(currentManifest) : undefined;
    const currentStat = currentKey ? await this.store.stat(currentKey) : undefined;

    if (!currentManifest || !currentKey || !currentStat) {
      const refreshed = await this.refreshInternal(normalizedId, currentManifest);
      this.emitTelemetry(normalizedId, refreshed, startedAt);
      return refreshed;
    }

    if (!this.isStale(currentManifest, startedAt)) {
      const result: InternalBundleResult = {
        status: 'fresh',
        manifest: currentManifest,
        path: currentKey,
        bytes: currentStat.bytes,
      };
      this.emitTelemetry(normalizedId, result, startedAt);
      return result;
    }

    const refreshed = await this.refreshInternal(normalizedId, currentManifest);
    if (refreshed.status === 'fresh') {
      const manifestForResult = refreshed.manifest ?? currentManifest;
      const result: InternalBundleResult = {
        status: 'stale',
        manifest: manifestForResult,
        path: refreshed.path ?? currentKey,
        reason: 'revalidated',
        bytes: refreshed.bytes ?? currentStat.bytes,
      };
      this.emitTelemetry(normalizedId, result, startedAt);
      return result;
    }
    this.emitTelemetry(normalizedId, refreshed, startedAt);
    return refreshed;
  }

  async refresh(courseId: string): Promise<BundleResult> {
    const normalizedId = courseId.trim();
    const startedAt = this.now();
    const previous = await this.loadManifest(normalizedId);
    const result = await this.refreshInternal(normalizedId, previous);
    this.emitTelemetry(normalizedId, result, startedAt);
    return result;
  }
}
