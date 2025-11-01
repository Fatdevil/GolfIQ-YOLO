import { encodeHUDBase64, type WatchHUDStateV1 } from './codec';
import type { WatchDiag } from './types';

type NativeWatchConnectorModule = {
  isCapable(): Promise<boolean>;
  sendHUD(payloadBase64: string): Promise<boolean>;
};

type AndroidNativeModule = {
  isCapable: () => Promise<boolean>;
  sendHUD: (payloadBase64: string) => Promise<boolean>;
};

type IOSNativeModule = {
  isCapable: () => Promise<boolean>;
  sendHUDB64: (payloadBase64: string) => Promise<boolean>;
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
};
