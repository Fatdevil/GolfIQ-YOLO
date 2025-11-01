import { encodeHUDBase64, type WatchHUDStateV1 } from './codec';

type NativeModuleBinding = {
  isCapable(): Promise<unknown>;
  send(base64Payload: string): Promise<unknown>;
};

function tryRequireReactNative(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native');
  } catch {
    return null;
  }
}

function getNativeModule(): NativeModuleBinding | null {
  const RN = tryRequireReactNative();
  const platform: string | undefined = RN?.Platform?.OS;
  const nativeModules = RN?.NativeModules;

  if (!platform || !nativeModules) {
    return null;
  }

  if (platform === 'android') {
    const androidModule = nativeModules.WatchConnector;
    if (
      androidModule &&
      typeof androidModule.isCapable === 'function' &&
      typeof androidModule.sendHUD === 'function'
    ) {
      return {
        isCapable: () => androidModule.isCapable(),
        send: (payload: string) => androidModule.sendHUD(payload),
      };
    }
  }

  if (platform === 'ios') {
    const iosModule = nativeModules.WatchConnectorIOS;
    if (
      iosModule &&
      typeof iosModule.isCapable === 'function' &&
      typeof iosModule.sendHUDB64 === 'function'
    ) {
      return {
        isCapable: () => iosModule.isCapable(),
        send: (payload: string) => iosModule.sendHUDB64(payload),
      };
    }
  }

  return null;
}

export const WatchBridge = {
  async isCapable(): Promise<boolean> {
    const binding = getNativeModule();
    if (!binding) {
      return false;
    }
    try {
      const result = await binding.isCapable();
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] isCapable failed', error);
      return false;
    }
  },
  async sendHUD(state: WatchHUDStateV1): Promise<boolean> {
    const binding = getNativeModule();
    if (!binding) {
      return false;
    }
    try {
      const base64Payload = encodeHUDBase64(state);
      const result = await binding.send(base64Payload);
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] sendHUD failed', error);
      return false;
    }
  },
};
