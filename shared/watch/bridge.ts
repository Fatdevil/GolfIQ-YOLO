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
let lastSendPromise: Promise<boolean> | null = null;
let lastSendScheduledAt = 0;

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

function sendHUDDebouncedInternal(
  state: WatchHUDStateV1,
  minIntervalMs: number = DEFAULT_DEBOUNCE_MS,
): Promise<boolean> {
  const now = Date.now();
  if (lastSendPromise && now - lastSendScheduledAt < minIntervalMs) {
    return lastSendPromise;
  }
  lastSendScheduledAt = now;
  const basePromise = sendHUDInternal(state);
  const wrappedPromise = basePromise.finally(() => {
    if (lastSendPromise === wrappedPromise) {
      lastSendPromise = null;
      lastSendScheduledAt = 0;
    }
  });
  lastSendPromise = wrappedPromise;
  return wrappedPromise;
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
    return sendHUDDebouncedInternal(state, options?.minIntervalMs);
  },
  getLastStatus(): LastStatus {
    return { ...lastStatus };
  },
  getCapabilities(): WatchDiag['capability'] {
    return detectCapabilities();
  },
};
