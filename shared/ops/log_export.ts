import type { EdgeDefaults, Platform as EdgePlatform } from "../edge/defaults";
import { getCachedEdgeDefaults } from "../edge/defaults";
import {
  evaluateEdgeRollout,
  type EdgeRolloutDecision,
  type RcRecord,
} from "../edge/rollout";
import { defaultBag, getUserBag, type Bag } from "../playslike/bag";
import { getTuningSnapshot, hydrateTunedCoeffs } from "../playslike/tuning";
import { recentReliabilityEvents, type ReliabilityEvent } from "../reliability/events";
import { resolveRunsApiConfig, getUploadQueueSummary, type UploadQueueSummary } from "../runs/uploader";
import { appVersion, buildNumber, builtAtUTC, gitSha, versionInfo } from "../app/version";

type DeviceSnapshot = Record<string, unknown>;

type PlatformSnapshot = {
  os: string;
  version: string | number | null;
};

type EdgeSnapshot = {
  platform: EdgePlatform;
  defaults: EdgeDefaults | null;
  pinnedModelId: string | null;
};

type TuningSnapshot = {
  active: boolean;
  samples: number | null;
  alpha: number | null;
  updatedAt: number | null;
};

type BagSnapshot = {
  defaults: Bag;
  personal: Bag | null;
  hasOverrides: boolean;
};

type RcSnapshot = Record<string, string | number | boolean>;

type LogBufferPayload = {
  reliability: ReliabilityEvent[];
  buffer: unknown[];
  windowMs: number;
};

type TelemetrySnapshot = {
  qaMode: boolean;
  optOut: boolean;
};

type RolloutSnapshot = EdgeRolloutDecision & {
  deviceId: string;
  rcEnforce: boolean;
};

export type DiagnosticsSnapshot = {
  capturedAt: string;
  version: typeof versionInfo;
  platform: PlatformSnapshot;
  device: DeviceSnapshot;
  edge: EdgeSnapshot;
  rollout: RolloutSnapshot;
  rc: RcSnapshot;
  bag: BagSnapshot;
  tuning: TuningSnapshot;
  queue: UploadQueueSummary | null;
  telemetry: TelemetrySnapshot;
  logs: LogBufferPayload;
};

export type DiagnosticsSnapshotOptions = {
  windowMs?: number;
  hints?: {
    qaMode?: boolean;
  };
};

export type LogExportOptions = {
  windowMs?: number;
  snapshot?: DiagnosticsSnapshot;
  hints?: DiagnosticsSnapshotOptions["hints"];
  extra?: Record<string, unknown> | null;
};

export type LogExportResult = {
  issueId: string;
  archiveSize: number;
  logCount: number;
};

const TELEMETRY_OPT_OUT_KEY = "__QA_TELEMETRY_OPT_OUT__";
const LOG_BUFFER_KEY = "__QA_LOG_BUFFER__";

function getGlobalObject(): typeof globalThis & {
  RC?: RcRecord;
  [TELEMETRY_OPT_OUT_KEY]?: unknown;
  [LOG_BUFFER_KEY]?: unknown;
} {
  return globalThis as typeof globalThis & {
    RC?: RcRecord;
    [TELEMETRY_OPT_OUT_KEY]?: unknown;
    [LOG_BUFFER_KEY]?: unknown;
  };
}

function readRcBoolean(rc: RcRecord, key: string): boolean {
  if (!rc || typeof rc !== "object") {
    return false;
  }
  const raw = (rc as Record<string, unknown>)[key];
  if (raw === true) {
    return true;
  }
  if (raw === false) {
    return false;
  }
  if (typeof raw === "number") {
    return raw !== 0;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function readRcSnippet(rc: RcRecord, limit = 24): RcSnapshot {
  if (!rc || typeof rc !== "object") {
    return {};
  }
  const entries = Object.entries(rc as Record<string, unknown>)
    .filter(([key, value]) => {
      if (!key || typeof key !== "string") {
        return false;
      }
      const type = typeof value;
      return type === "string" || type === "number" || type === "boolean";
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, Math.max(0, limit));
  const snippet: RcSnapshot = {};
  for (const [key, value] of entries) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      snippet[key] = value;
    }
  }
  return snippet;
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "utf8"));
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function toBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i += 1) {
    binary += String.fromCharCode(data[i]!);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  throw new Error("Base64 encoding not supported in this environment");
}

function crc32(data: Uint8Array): number {
  const table = crc32.table ?? (crc32.table = createCrc32Table());
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i]!;
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
}

function createZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  if (!entries.length) {
    return new Uint8Array(0);
  }
  const normalized = entries.map((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    return {
      name: entry.name,
      nameBytes,
      data: entry.data,
      crc: crc32(entry.data),
      size: entry.data.length,
    };
  });

  const localSize = normalized.reduce((total, entry) => total + 30 + entry.nameBytes.length + entry.size, 0);
  const centralSize = normalized.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0);
  const totalSize = localSize + centralSize + 22;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  let offset = 0;
  const localOffsets: number[] = [];

  for (const entry of normalized) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    offset += 4;
    view.setUint16(offset, 20, true); // version needed
    offset += 2;
    view.setUint16(offset, 0, true); // flags
    offset += 2;
    view.setUint16(offset, 0, true); // compression (store)
    offset += 2;
    view.setUint16(offset, 0, true); // mod time
    offset += 2;
    view.setUint16(offset, 0, true); // mod date
    offset += 2;
    view.setUint32(offset, entry.crc >>> 0, true);
    offset += 4;
    view.setUint32(offset, entry.size, true);
    offset += 4;
    view.setUint32(offset, entry.size, true);
    offset += 4;
    view.setUint16(offset, entry.nameBytes.length, true);
    offset += 2;
    view.setUint16(offset, 0, true); // extra length
    offset += 2;
    buffer.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
    buffer.set(entry.data, offset);
    offset += entry.size;
  }

  const centralDirectoryOffset = offset;

  normalized.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    offset += 4;
    view.setUint16(offset, 20, true); // version made by
    offset += 2;
    view.setUint16(offset, 20, true); // version needed
    offset += 2;
    view.setUint16(offset, 0, true); // flags
    offset += 2;
    view.setUint16(offset, 0, true); // compression
    offset += 2;
    view.setUint16(offset, 0, true); // mod time
    offset += 2;
    view.setUint16(offset, 0, true); // mod date
    offset += 2;
    view.setUint32(offset, entry.crc >>> 0, true);
    offset += 4;
    view.setUint32(offset, entry.size, true);
    offset += 4;
    view.setUint32(offset, entry.size, true);
    offset += 4;
    view.setUint16(offset, entry.nameBytes.length, true);
    offset += 2;
    view.setUint16(offset, 0, true); // extra length
    offset += 2;
    view.setUint16(offset, 0, true); // comment length
    offset += 2;
    view.setUint16(offset, 0, true); // disk number
    offset += 2;
    view.setUint16(offset, 0, true); // internal attrs
    offset += 2;
    view.setUint32(offset, 0, true); // external attrs
    offset += 4;
    view.setUint32(offset, localOffsets[index]!, true);
    offset += 4;
    buffer.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  });

  const centralDirectorySize = offset - centralDirectoryOffset;

  view.setUint32(offset, 0x06054b50, true);
  offset += 4;
  view.setUint16(offset, 0, true); // disk number
  offset += 2;
  view.setUint16(offset, 0, true); // disk where central dir starts
  offset += 2;
  view.setUint16(offset, normalized.length, true);
  offset += 2;
  view.setUint16(offset, normalized.length, true);
  offset += 2;
  view.setUint32(offset, centralDirectorySize, true);
  offset += 4;
  view.setUint32(offset, centralDirectoryOffset, true);
  offset += 4;
  view.setUint16(offset, 0, true); // comment length
  offset += 2;

  return buffer;
}

async function collectPlatformSnapshot(): Promise<PlatformSnapshot> {
  try {
    const mod = (await import("react-native")) as { Platform?: { OS: string; Version?: unknown } };
    const Platform = mod.Platform;
    if (Platform && typeof Platform === "object") {
      return {
        os: typeof Platform.OS === "string" ? Platform.OS : "unknown",
        version: Platform.Version ?? null,
      };
    }
  } catch {
    // ignore missing react-native context
  }
  return { os: "unknown", version: null };
}

async function collectDeviceSnapshot(): Promise<DeviceSnapshot> {
  const snapshot: DeviceSnapshot = {};
  try {
    const Device = (await import("expo-device")) as Record<string, unknown> & {
      osName?: string;
      osVersion?: string;
      modelName?: string;
      modelId?: string;
      manufacturer?: string;
      deviceType?: string | number;
      totalMemory?: number;
    };
    if (Device && typeof Device === "object") {
      if (typeof Device.osName === "string") {
        snapshot.osName = Device.osName;
      }
      if (typeof Device.osVersion === "string") {
        snapshot.osVersion = Device.osVersion;
      }
      if (typeof Device.modelName === "string") {
        snapshot.modelName = Device.modelName;
      }
      if (typeof Device.modelId === "string") {
        snapshot.modelId = Device.modelId;
      }
      if (typeof Device.manufacturer === "string") {
        snapshot.manufacturer = Device.manufacturer;
      }
      if (typeof Device.deviceType !== "undefined") {
        snapshot.deviceType = Device.deviceType;
      }
      if (typeof Device.totalMemory === "number") {
        snapshot.totalMemory = Device.totalMemory;
      }
    }
  } catch {
    // ignore optional module failures
  }

  try {
    const Constants = (await import("expo-constants")) as Record<string, unknown> & {
      appOwnership?: string | null;
      expoConfig?: { version?: string | null; runtimeVersion?: string | null } | null;
      manifest?: { version?: string | null; runtimeVersion?: string | null } | null;
    };
    if (Constants && typeof Constants === "object") {
      if (typeof Constants.appOwnership === "string") {
        snapshot.appOwnership = Constants.appOwnership;
      }
      const manifest = (Constants.expoConfig ?? Constants.manifest) as
        | { version?: string | null; runtimeVersion?: string | null }
        | null
        | undefined;
      if (manifest && typeof manifest === "object") {
        if (typeof manifest.version === "string") {
          snapshot.manifestVersion = manifest.version;
        }
        if (typeof manifest.runtimeVersion === "string") {
          snapshot.runtimeVersion = manifest.runtimeVersion;
        }
      }
    }
  } catch {
    // ignore
  }

  return snapshot;
}

async function resolveDeviceIdentifier(): Promise<string> {
  try {
    const Application = (await import("expo-application")) as Record<string, unknown> & {
      androidId?: string | null;
      getIosIdForVendorAsync?: () => Promise<string | null | undefined>;
    };
    if (Application && typeof Application === "object") {
      const androidId = typeof Application.androidId === "string" ? Application.androidId.trim() : "";
      if (androidId) {
        return `android-${androidId}`;
      }
      if (typeof Application.getIosIdForVendorAsync === "function") {
        const iosId = await Application.getIosIdForVendorAsync();
        if (iosId && typeof iosId === "string" && iosId.trim()) {
          return `ios-${iosId.trim()}`;
        }
      }
    }
  } catch {
    // ignore missing module
  }

  try {
    const Constants = (await import("expo-constants")) as Record<string, unknown> & {
      installationId?: string | null;
      deviceId?: string | null;
    };
    if (Constants && typeof Constants === "object") {
      const installationId = typeof Constants.installationId === "string"
        ? Constants.installationId.trim()
        : "";
      if (installationId) {
        return installationId;
      }
      const deviceId = typeof Constants.deviceId === "string" ? Constants.deviceId.trim() : "";
      if (deviceId) {
        return deviceId;
      }
    }
  } catch {
    // ignore
  }

  return "unknown-device";
}

function readLogBuffer(maxEntries = 200): unknown[] {
  const globalObject = getGlobalObject();
  const raw = globalObject[LOG_BUFFER_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  const recent = raw.slice(Math.max(0, raw.length - maxEntries));
  return recent.map((entry) => sanitizeLogEntry(entry));
}

function sanitizeLogEntry(entry: unknown): unknown {
  if (entry === null || typeof entry === "undefined") {
    return null;
  }
  if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
    return entry;
  }
  if (Array.isArray(entry)) {
    return entry.map((item) => sanitizeLogEntry(item));
  }
  if (typeof entry === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof key !== "string") {
        continue;
      }
      const sanitized = sanitizeLogEntry(value);
      if (typeof sanitized !== "undefined") {
        result[key] = sanitized;
      }
    }
    return result;
  }
  return String(entry);
}

function describeBagSnapshot(personal: Bag | null, defaults: Bag): BagSnapshot {
  if (!personal) {
    return { defaults, personal: null, hasOverrides: false };
  }
  const hasOverrides = Object.keys(defaults).some((club) => {
    const key = club as keyof Bag;
    return typeof personal[key] === "number" && personal[key] !== defaults[key];
  });
  return {
    defaults,
    personal,
    hasOverrides,
  };
}

function describeTuningSnapshot(): TuningSnapshot {
  try {
    const snapshot = getTuningSnapshot();
    if (!snapshot) {
      return { active: false, samples: null, alpha: null, updatedAt: null };
    }
    return {
      active: true,
      samples: typeof snapshot.samples === "number" ? snapshot.samples : null,
      alpha: typeof snapshot.alpha === "number" ? snapshot.alpha : null,
      updatedAt: typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : null,
    };
  } catch {
    return { active: false, samples: null, alpha: null, updatedAt: null };
  }
}

export function isTelemetryOptedOut(): boolean {
  const globalObject = getGlobalObject();
  return globalObject[TELEMETRY_OPT_OUT_KEY] === true;
}

export function setTelemetryOptOut(value: boolean): void {
  const globalObject = getGlobalObject();
  if (value) {
    globalObject[TELEMETRY_OPT_OUT_KEY] = true;
  } else {
    delete globalObject[TELEMETRY_OPT_OUT_KEY];
  }
}

export async function collectDiagnosticsSnapshot(
  options: DiagnosticsSnapshotOptions = {},
): Promise<DiagnosticsSnapshot> {
  const windowMs = options.windowMs ?? 10 * 60 * 1_000;
  const platform = await collectPlatformSnapshot();
  const edgePlatform: EdgePlatform = platform.os === "ios" ? "ios" : "android";
  const rcFull = getGlobalObject().RC;
  const rcSnippet = readRcSnippet(rcFull);
  const rcEnforce = readRcBoolean(rcFull, "edge.defaults.enforce");

  const [device, personalBag, queue, defaults, reliability] = await Promise.all([
    collectDeviceSnapshot(),
    getUserBag().catch(() => null),
    getUploadQueueSummary().catch(() => null),
    getCachedEdgeDefaults(edgePlatform).catch(() => null),
    Promise.resolve(recentReliabilityEvents(windowMs)),
  ]);

  await hydrateTunedCoeffs().catch(() => null);

  const defaultsBag = defaultBag();
  const bag = describeBagSnapshot(personalBag, defaultsBag);
  const tuning = describeTuningSnapshot();
  const deviceId = await resolveDeviceIdentifier();
  const decision = evaluateEdgeRollout({ deviceId, rc: rcFull, rcEnforceFlag: rcEnforce });
  const logs: LogBufferPayload = {
    reliability,
    buffer: readLogBuffer(),
    windowMs,
  };

  const telemetry: TelemetrySnapshot = {
    qaMode: options.hints?.qaMode ?? false,
    optOut: isTelemetryOptedOut(),
  };

  const edge: EdgeSnapshot = {
    platform: edgePlatform,
    defaults,
    pinnedModelId:
      rcFull && typeof rcFull === "object" && typeof (rcFull as Record<string, unknown>)["edge.model.pinnedId"] === "string"
        ? String((rcFull as Record<string, unknown>)["edge.model.pinnedId"])
        : null,
  };

  const rollout: RolloutSnapshot = {
    ...decision,
    deviceId,
    rcEnforce,
  };

  return {
    capturedAt: new Date().toISOString(),
    version: { appVersion, buildNumber, gitSha, builtAtUTC },
    platform,
    device,
    edge,
    rollout,
    rc: rcSnippet,
    bag,
    tuning,
    queue,
    telemetry,
    logs,
  };
}

export async function exportDiagnosticsLogs(
  options: LogExportOptions = {},
): Promise<LogExportResult> {
  const snapshot =
    options.snapshot ??
    (await collectDiagnosticsSnapshot({ windowMs: options.windowMs, hints: options.hints }));
  const { logs, ...summaryRest } = snapshot;
  const summary = JSON.parse(JSON.stringify(summaryRest)) as typeof summaryRest;
  const logsPayload = JSON.parse(
    JSON.stringify({
      ...logs,
      capturedAt: snapshot.capturedAt,
    }),
  ) as LogBufferPayload & { capturedAt: string };

  const entries = [
    { name: "snapshot.json", data: encodeUtf8(JSON.stringify(summary, null, 2)) },
    { name: "logs.json", data: encodeUtf8(JSON.stringify(logsPayload, null, 2)) },
  ];
  const archive = createZip(entries);
  const archiveSize = archive.length;
  const archiveBase64 = toBase64(archive);

  const { base, apiKey } = resolveRunsApiConfig();
  const url = `${base.replace(/\/$/, "")}/issues`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const payload = {
    kind: "diagnostics.log_export",
    requestedAt: new Date().toISOString(),
    summary,
    logs: {
      ...logsPayload,
      archiveBytes: archiveSize,
      entries: (logsPayload.reliability?.length ?? 0) + (logsPayload.buffer?.length ?? 0),
    },
    archive: {
      filename: `diagnostics-${Date.now()}.zip`,
      encoding: "base64",
      contentType: "application/zip",
      data: archiveBase64,
    },
    extra: options.extra ?? null,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Log export failed (${response.status})`);
  }

  const body = await response.json().catch(() => ({}));
  const issueIdRaw = (body as { id?: unknown }).id;
  const issueId = typeof issueIdRaw === "string" ? issueIdRaw : "";
  const logCount =
    (logsPayload.reliability?.length ?? 0) + (logsPayload.buffer?.length ?? 0);

  return {
    issueId,
    archiveSize,
    logCount,
  };
}
