import type { EmitterSubscription } from 'react-native';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { Buffer } from 'buffer';

import type { IMUBatchV1 } from '../../../../shared/shotsense/dto';
import { shotSense } from '../shotsense/ShotSenseService';

const { WatchConnectorIOS } = NativeModules;

let subscription: EmitterSubscription | null = null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

function decodeIMUBatch(bytes: Uint8Array): IMUBatchV1 | null {
  if (!bytes || bytes.length === 0) {
    return null;
  }
  try {
    const json = textDecoder ? textDecoder.decode(bytes) : Buffer.from(bytes).toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) {
      return parsed as IMUBatchV1;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[WatchBridge+Sense] failed to decode IMU batch', error);
    }
  }
  return null;
}

function decodeLegacyEvent(evt: { b64?: string } | null): Uint8Array | null {
  if (!evt?.b64) {
    return null;
  }
  try {
    return Buffer.from(evt.b64, 'base64');
  } catch (error) {
    if (__DEV__) {
      console.warn('[WatchBridge+Sense] failed to decode base64 payload', error);
    }
    return null;
  }
}

export function onWatchIMUMessageData(bytes: Uint8Array): void {
  try {
    const batch = decodeIMUBatch(bytes);
    if (batch) {
      shotSense.pushIMUBatch(batch);
    }
  } catch {
    // Swallow unexpected errors; native side should continue streaming.
  }
}

export function initWatchIMUReceiver(): void {
  if (!WatchConnectorIOS || subscription) {
    return;
  }
  const emitter = new NativeEventEmitter(WatchConnectorIOS);
  subscription = emitter.addListener('watch.imu.v1', (evt) => {
    const bytes = decodeLegacyEvent(evt);
    if (bytes) {
      onWatchIMUMessageData(bytes);
    }
  });
}

export function teardownWatchIMUReceiver(): void {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}
