import { encodeHUDBase64, type WatchHUDStateV1 } from './codec';
import { hashOverlaySnapshot, type OverlaySnapshotV1 } from '../overlay/transport';
import type { WatchDiag } from './types';

type NativeWatchConnectorModule = {
  isCapable(): Promise<boolean>;
  sendHUD(payloadBase64: string): Promise<boolean>;
  sendOverlayJSON?(jsonPayload: string): Promise<boolean>;
  setSenseStreamingEnabled?(enabled: boolean): Promise<boolean> | void;
};

type AndroidNativeModule = {
  isCapable: () => Promise<boolean>;
  sendHUD: (payloadBase64: string) => Promise<boolean>;
  sendOverlayJSON?: (jsonPayload: string) => Promise<boolean>;
  setSenseStreamingEnabled?: (enabled: boolean) => Promise<boolean>;
};

type IOSNativeModule = {
  isCapable: () => Promise<boolean>;
  sendHUDB64: (payloadBase64: string) => Promise<boolean>;
  sendOverlayJSON?: (jsonPayload: string) => Promise<boolean>;
  setSenseStreamingEnabled?: (enabled: boolean) => Promise<boolean>;
};

type LastStatus = WatchDiag['lastSend'];

const DEFAULT_DEBOUNCE_MS = 250;

let lastStatus: LastStatus = { ok: false, ts: 0, bytes: 0 };

let inFlight: Promise<boolean> | null = null;
let lastSentAt = 0;
let nextAllowedAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: WatchHUDStateV1 | null = null;
let pendingPromise: Promise<boolean> | null = null;
let pendingResolve: ((ok: boolean) => void) | null = null;
let pendingWindowMs = DEFAULT_DEBOUNCE_MS;

function tryRequireReactNative(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native');
  } catch {
    return null;
  }
}

function estimatePayloadBytes(base64: string): number {
  if (!base64) {
    return 0;
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function getNativeModule(): NativeWatchConnectorModule | null {
  const RN = tryRequireReactNative();
  const platform: string | undefined = RN?.Platform?.OS;
  const nativeModules = RN?.NativeModules;

  if (!platform || !nativeModules) {
    return null;
  }

  if (platform === 'android') {
    const mod: AndroidNativeModule | undefined = nativeModules.WatchConnector;
    if (!mod) {
      return null;
    }
    if (typeof mod.isCapable !== 'function' || typeof mod.sendHUD !== 'function') {
      return null;
    }
    return mod;
  }

  if (platform === 'ios') {
    const mod: IOSNativeModule | undefined = nativeModules.WatchConnectorIOS;
    if (!mod) {
      return null;
    }
    if (typeof mod.isCapable !== 'function' || typeof mod.sendHUDB64 !== 'function') {
      return null;
    }
    return {
      isCapable: () => mod.isCapable(),
      sendHUD: (payloadBase64: string) => mod.sendHUDB64(payloadBase64),
      sendOverlayJSON: mod.sendOverlayJSON
        ? (jsonPayload: string) => mod.sendOverlayJSON!(jsonPayload)
        : undefined,
      setSenseStreamingEnabled: mod.setSenseStreamingEnabled
        ? (enabled: boolean) => mod.setSenseStreamingEnabled!(enabled)
        : undefined,
    };
  }

  return null;
}

function detectCapabilities(): WatchDiag['capability'] {
  const RN = tryRequireReactNative();
  const nativeModules = RN?.NativeModules;
  if (!nativeModules) {
    return { android: false, ios: false };
  }
  const androidModule = nativeModules.WatchConnector as Partial<AndroidNativeModule> | undefined;
  const iosModule = nativeModules.WatchConnectorIOS as Partial<IOSNativeModule> | undefined;
  const android = Boolean(
    androidModule && typeof androidModule.isCapable === 'function' && typeof androidModule.sendHUD === 'function',
  );
  const ios = Boolean(
    iosModule && typeof iosModule.isCapable === 'function' && typeof iosModule.sendHUDB64 === 'function',
  );
  return { android, ios };
}

type OverlayModule = {
  sendOverlayJSON: (jsonPayload: string) => Promise<boolean>;
};

function getOverlayModule(): OverlayModule | null {
  const RN = tryRequireReactNative();
  const platform: string | undefined = RN?.Platform?.OS;
  const nativeModules = RN?.NativeModules;

  if (!platform || !nativeModules) {
    return null;
  }

  if (platform === 'android') {
    const mod: AndroidNativeModule | undefined = nativeModules.WatchConnector;
    if (mod?.sendOverlayJSON && typeof mod.sendOverlayJSON === 'function') {
      return { sendOverlayJSON: mod.sendOverlayJSON };
    }
    return null;
  }

  if (platform === 'ios') {
    const mod: IOSNativeModule | undefined = nativeModules.WatchConnectorIOS;
    if (mod?.sendOverlayJSON && typeof mod.sendOverlayJSON === 'function') {
      return { sendOverlayJSON: (json: string) => mod.sendOverlayJSON!(json) };
    }
    return null;
  }

  return null;
}

async function invokeSenseStreaming(
  fn: (enabled: boolean) => unknown,
  enabled: boolean,
): Promise<boolean> {
  try {
    const result = fn(enabled);
    if (result instanceof Promise) {
      const resolved = await result;
      return resolved !== false;
    }
    return result !== false;
  } catch (error) {
    console.warn('[WatchBridge] setSenseStreamingEnabled failed', error);
    return false;
  }
}

async function setSenseStreamingInternal(enabled: boolean): Promise<boolean> {
  const mod = getNativeModule();
  if (mod?.setSenseStreamingEnabled) {
    return invokeSenseStreaming(mod.setSenseStreamingEnabled.bind(mod), enabled);
  }

  const RN = tryRequireReactNative();
  const nativeModules = RN?.NativeModules;
  if (!nativeModules) {
    return false;
  }

  const candidates = [
    nativeModules.VectorWatchBridge,
    nativeModules.WatchBridgeModule,
    nativeModules.WatchConnectorIOS,
    nativeModules.WatchConnector,
  ];

  for (const candidate of candidates) {
    const fn: ((enabled: boolean) => unknown) | undefined = candidate?.setSenseStreamingEnabled;
    if (typeof fn === 'function') {
      return invokeSenseStreaming(fn.bind(candidate), enabled);
    }
  }

  return false;
}

async function sendHUDInternal(state: WatchHUDStateV1): Promise<boolean> {
  const startedAt = Date.now();
  let base64Payload: string;
  try {
    base64Payload = encodeHUDBase64(state);
  } catch (error) {
    console.warn('[WatchBridge] encodeHUDBase64 failed', error);
    lastStatus = { ok: false, ts: Date.now(), bytes: 0 };
    return false;
  }
  const bytes = estimatePayloadBytes(base64Payload);
  const mod = getNativeModule();
  if (!mod) {
    lastStatus = { ok: false, ts: startedAt, bytes };
    return false;
  }
  try {
    const result = await mod.sendHUD(base64Payload);
    const ok = result === true;
    lastStatus = { ok, ts: Date.now(), bytes };
    return ok;
  } catch (error) {
    console.warn('[WatchBridge] sendHUD failed', error);
    lastStatus = { ok: false, ts: Date.now(), bytes };
    return false;
  }
}

async function sendNow(state: WatchHUDStateV1): Promise<boolean> {
  lastSentAt = Date.now();
  return (inFlight = sendHUDInternal(state).finally(() => {
    inFlight = null;
  }));
}

function scheduleTrailing(
  atMs: number,
  state: WatchHUDStateV1,
  windowMs: number,
): Promise<boolean> {
  pendingState = state;
  if (!pendingPromise) {
    pendingPromise = new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
    pendingWindowMs = windowMs;
  } else {
    pendingWindowMs = Math.max(pendingWindowMs, windowMs);
  }
  if (pendingTimer) {
    clearTimeout(pendingTimer);
  }
  const delay = Math.max(0, atMs - Date.now());
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    const stateToSend = pendingState!;
    pendingState = null;
    const windowForSend = pendingWindowMs;
    const ok = await sendNow(stateToSend);
    const resolve = pendingResolve!;
    pendingResolve = null;
    nextAllowedAt = lastSentAt + windowForSend;
    pendingWindowMs = DEFAULT_DEBOUNCE_MS;
    pendingPromise = null;
    resolve(ok);
  }, delay);
  return pendingPromise!;
}

export function hasPending(): boolean {
  return Boolean(pendingTimer || pendingPromise);
}

async function sendOverlaySnapshotInternal(snapshot: OverlaySnapshotV1): Promise<boolean> {
  const module = getOverlayModule();
  if (!module) {
    return false;
  }
  try {
    const payload = JSON.stringify(snapshot);
    const result = await module.sendOverlayJSON(payload);
    return result === true;
  } catch (error) {
    console.warn('[WatchBridge] sendOverlayJSON failed', error);
    return false;
  }
}

const OVERLAY_MIN_INTERVAL_MS = 2000;

type OverlayPending = {
  snapshot: OverlaySnapshotV1;
  hash: string;
};

const overlayState: {
  lastSentAt: number;
  lastHash: string | null;
  pending: OverlayPending | null;
  timer: ReturnType<typeof setTimeout> | null;
} = {
  lastSentAt: 0,
  lastHash: null,
  pending: null,
  timer: null,
};

function flushOverlay(): void {
  const payload = overlayState.pending;
  overlayState.pending = null;
  overlayState.timer = null;
  if (!payload) {
    return;
  }
  void sendOverlaySnapshotInternal(payload.snapshot).then((ok) => {
    if (ok) {
      overlayState.lastHash = payload.hash;
      overlayState.lastSentAt = Date.now();
    }
  });
}

function scheduleOverlay(snapshot: OverlaySnapshotV1, hash: string, minIntervalMs: number): void {
  if (overlayState.lastHash === hash || overlayState.pending?.hash === hash) {
    return;
  }
  overlayState.pending = { snapshot, hash };
  const now = Date.now();
  const elapsed = now - overlayState.lastSentAt;
  const delay = Math.max(0, minIntervalMs - elapsed);
  if (delay === 0 && !overlayState.timer) {
    flushOverlay();
    return;
  }
  if (!overlayState.timer) {
    overlayState.timer = setTimeout(flushOverlay, delay);
  }
}

export function resetOverlayThrottle(): void {
  if (overlayState.timer) {
    clearTimeout(overlayState.timer);
    overlayState.timer = null;
  }
  overlayState.pending = null;
}

function queueOverlaySnapshotInternal(
  snapshot: OverlaySnapshotV1,
  options?: { minIntervalMs?: number },
): void {
  const minInterval = Math.max(options?.minIntervalMs ?? OVERLAY_MIN_INTERVAL_MS, 0);
  const hash = hashOverlaySnapshot(snapshot);
  scheduleOverlay(snapshot, hash, minInterval);
}

function sendHUDDebounced(
  state: WatchHUDStateV1,
  minIntervalMs: number = DEFAULT_DEBOUNCE_MS,
): Promise<boolean> {
  const now = Date.now();
  const windowMs = Math.max(0, minIntervalMs);

  if (windowMs !== DEFAULT_DEBOUNCE_MS) {
    nextAllowedAt = Math.max(nextAllowedAt, lastSentAt + windowMs);
  }

  if (inFlight) {
    const at = Math.max(nextAllowedAt || lastSentAt + windowMs, now + windowMs);
    return scheduleTrailing(at, state, windowMs);
  }

  if (now < nextAllowedAt) {
    return scheduleTrailing(nextAllowedAt, state, windowMs);
  }

  nextAllowedAt = now + windowMs;
  return sendNow(state);
}

async function flushPending(): Promise<boolean> {
  if (!pendingPromise || !pendingState) {
    return false;
  }
  const stateToSend = pendingState;
  const resolvePending = pendingResolve;
  const windowForSend = pendingWindowMs;
  pendingState = null;
  pendingResolve = null;
  pendingPromise = null;
  pendingWindowMs = DEFAULT_DEBOUNCE_MS;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (inFlight) {
    try {
      await inFlight;
    } catch {
      // ignore errors from the in-flight attempt; we'll still flush the trailing payload
    }
  }
  const ok = await sendNow(stateToSend);
  nextAllowedAt = lastSentAt + windowForSend;
  if (resolvePending) {
    resolvePending(ok);
  }
  return ok;
}

export function cancelPending(reason: string = 'user-disabled'): boolean {
  void reason;
  const hadPending = Boolean(pendingTimer || pendingPromise || pendingState);
  const windowForPending = pendingWindowMs;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingPromise = null;
  pendingState = null;
  pendingWindowMs = DEFAULT_DEBOUNCE_MS;
  if (resolve) {
    resolve(false);
  }
  if (hadPending) {
    const now = Date.now();
    nextAllowedAt = now;
    lastSentAt = Math.min(lastSentAt, now - windowForPending);
  }
  return hadPending;
}

export const WatchBridge = {
  async isCapable(): Promise<boolean> {
    const mod = getNativeModule();
    if (!mod) {
      return false;
    }
    try {
      const result = await mod.isCapable();
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] isCapable failed', error);
      return false;
    }
  },
  async sendHUD(state: WatchHUDStateV1): Promise<boolean> {
    return sendHUDInternal(state);
  },
  sendHUDDebounced(state: WatchHUDStateV1, options?: { minIntervalMs?: number }): Promise<boolean> {
    return sendHUDDebounced(state, options?.minIntervalMs);
  },
  getLastStatus(): LastStatus {
    return { ...lastStatus };
  },
  getCapabilities(): WatchDiag['capability'] {
    return detectCapabilities();
  },
  flush(): Promise<boolean> {
    return flushPending();
  },
  cancelPending,
  hasPending,
  setSenseStreaming(enabled: boolean): Promise<boolean> {
    return setSenseStreamingInternal(enabled);
  },
  async sendOverlaySnapshot(snapshot: OverlaySnapshotV1): Promise<boolean> {
    const hash = hashOverlaySnapshot(snapshot);
    if (overlayState.lastHash === hash && !overlayState.pending) {
      return true;
    }
    const ok = await sendOverlaySnapshotInternal(snapshot);
    if (ok) {
      overlayState.lastHash = hash;
      overlayState.lastSentAt = Date.now();
    }
    return ok;
  },
  queueOverlaySnapshot(snapshot: OverlaySnapshotV1, options?: { minIntervalMs?: number }): void {
    queueOverlaySnapshotInternal(snapshot, options);
  },
  resetOverlayThrottle,
};

export { queueOverlaySnapshotInternal as queueOverlaySnapshot };
