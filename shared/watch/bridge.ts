import { NativeModules, Platform } from 'react-native';

import { encodeHUD } from './codec';
import type { WatchHUDStateV1 } from './types';

type NativeWatchConnectorModule = {
  isCapable(): Promise<boolean>;
  sendHUD(base64Payload: string): Promise<boolean>;
};

const getNativeModule = (): NativeWatchConnectorModule | null => {
  if (Platform.OS !== 'android') {
    return null;
  }
  const modules = NativeModules as { WatchConnector?: NativeWatchConnectorModule };
  const module = modules.WatchConnector;
  if (!module || typeof module.isCapable !== 'function' || typeof module.sendHUD !== 'function') {
    return null;
  }
  return module;
};

const maybeBufferFrom = (value: Uint8Array): string | null => {
  const globalBuffer = (globalThis as { Buffer?: { from: (data: Uint8Array) => { toString(encoding: string): string } } }).Buffer;
  if (!globalBuffer?.from) {
    return null;
  }
  return globalBuffer.from(value).toString('base64');
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

const toBase64 = (value: Uint8Array): string => {
  const bufferResult = maybeBufferFrom(value);
  if (bufferResult) {
    return bufferResult;
  }
  let output = '';
  for (let i = 0; i < value.length; i += 3) {
    const byte1 = value[i] ?? 0;
    const byte2 = value[i + 1] ?? 0;
    const byte3 = value[i + 2] ?? 0;

    const segment = (byte1 << 16) | (byte2 << 8) | byte3;
    const enc1 = (segment >> 18) & 0x3f;
    const enc2 = (segment >> 12) & 0x3f;
    const enc3 = (segment >> 6) & 0x3f;
    const enc4 = segment & 0x3f;

    output += BASE64_ALPHABET.charAt(enc1);
    output += BASE64_ALPHABET.charAt(enc2);
    output += i + 1 < value.length ? BASE64_ALPHABET.charAt(enc3) : '=';
    output += i + 2 < value.length ? BASE64_ALPHABET.charAt(enc4) : '=';
  }
  return output;
};

export const WatchBridge = {
  async isCapable(): Promise<boolean> {
    const module = getNativeModule();
    if (!module) {
      return false;
    }
    try {
      const result = await module.isCapable();
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] isCapable failed', error);
      return false;
    }
  },
  async sendHUD(state: WatchHUDStateV1): Promise<boolean> {
    const module = getNativeModule();
    if (!module) {
      return false;
    }
    try {
      const payload = encodeHUD(state);
      const base64Payload = toBase64(payload);
      const result = await module.sendHUD(base64Payload);
      return result === true;
    } catch (error) {
      console.warn('[WatchBridge] sendHUD failed', error);
      return false;
    }
  },
};
