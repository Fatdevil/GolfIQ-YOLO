import { encodeHUDBase64, type WatchHUDStateV1 } from './codec';

type NativeWatchConnectorModule = {
  isCapable(): Promise<boolean>;
  sendHUD(payloadBase64: string): Promise<boolean>;
};

function tryRequireReactNative(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native');
  } catch {
    return null;
  }
}

function getNativeModule(): NativeWatchConnectorModule | null {
  const RN = tryRequireReactNative();
  const isAndroid = RN?.Platform?.OS === 'android';
  const mod = RN?.NativeModules?.WatchConnector;
  if (!isAndroid || !mod) {
    return null;
  }
  if (typeof mod.isCapable !== 'function' || typeof mod.sendHUD !== 'function') {
    return null;
  }
  return mod as NativeWatchConnectorModule;
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
    const mod = getNativeModule();
    if (!mod) {
      return false;
    }
    try {
      const base64Payload = encodeHUDBase64(state);
      const result = await mod.sendHUD(base64Payload);
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] sendHUD failed', error);
      return false;
    }
  },
};
