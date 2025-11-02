import type { EmitterSubscription } from 'react-native';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { Buffer } from 'buffer';

import type { IMUBatchV1 } from '../../../../shared/shotsense/dto';
import { shotSense } from '../modules/shotsense/ShotSenseService';

const { WatchConnectorIOS } = NativeModules;

let subscription: EmitterSubscription | null = null;

function decodeBatch(evt: { b64: string }): IMUBatchV1 | null {
  if (!evt || typeof evt.b64 !== 'string' || evt.b64.length === 0) {
    return null;
  }
  try {
    const json = Buffer.from(evt.b64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) {
      return parsed as IMUBatchV1;
    }
  } catch {
    return null;
  }
  return null;
}

export function initWatchIMUReceiver(): void {
  if (!WatchConnectorIOS || subscription) {
    return;
  }
  const emitter = new NativeEventEmitter(WatchConnectorIOS);
  subscription = emitter.addListener('watch.imu.v1', (evt) => {
    try {
      const batch = decodeBatch(evt);
      if (batch) {
        shotSense.pushIMUBatch(batch);
      }
    } catch (error) {
      console.warn('[WatchBridge+Sense] failed to process IMU batch', error);
    }
  });
}

export function teardownWatchIMUReceiver(): void {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}
