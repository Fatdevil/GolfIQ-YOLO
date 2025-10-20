import { Platform } from 'react-native';

import { recentReliabilityEvents } from '../../../shared/reliability/events';
import {
  getUploadQueueSummary,
  resolveRunsApiConfig,
} from '../../../shared/runs/uploader';

type IssueReportResult = {
  id: string;
};

type DeviceInfo = Record<string, unknown>;

async function gatherDeviceInfo(): Promise<DeviceInfo> {
  const info: DeviceInfo = {
    platform: Platform.OS,
    platformVersion: Platform.Version ?? null,
  };
  try {
    const Device = (await import('expo-device')) as Record<string, unknown> & {
      osName?: string;
      osVersion?: string;
      modelName?: string;
      manufacturer?: string;
      deviceType?: string | number;
      totalMemory?: number;
    };
    if (Device) {
      if (typeof Device.osName === 'string') {
        info.osName = Device.osName;
      }
      if (typeof Device.osVersion === 'string') {
        info.osVersion = Device.osVersion;
      }
      if (typeof Device.modelName === 'string') {
        info.modelName = Device.modelName;
      }
      if (typeof Device.manufacturer === 'string') {
        info.manufacturer = Device.manufacturer;
      }
      if (typeof Device.deviceType !== 'undefined') {
        info.deviceType = Device.deviceType;
      }
      if (typeof Device.totalMemory === 'number') {
        info.totalMemory = Device.totalMemory;
      }
    }
  } catch {
    // ignore missing expo-device
  }

  try {
    const Constants = (await import('expo-constants')) as Record<string, unknown> & {
      appOwnership?: string | null;
      expoConfig?: { version?: string | null; runtimeVersion?: string | null } | null;
      manifest?: { version?: string | null } | null;
    };
    if (Constants) {
      if (typeof Constants.appOwnership === 'string') {
        info.appOwnership = Constants.appOwnership;
      }
      const manifest = Constants.expoConfig ?? Constants.manifest;
      if (manifest && typeof manifest === 'object') {
        const version = (manifest as { version?: string | null }).version;
        if (typeof version === 'string') {
          info.appVersion = version;
        }
        const runtime = (manifest as { runtimeVersion?: string | null }).runtimeVersion;
        if (typeof runtime === 'string') {
          info.runtimeVersion = runtime;
        }
      }
    }
  } catch {
    // ignore missing expo-constants
  }

  return info;
}

function collectRcFlags(): Record<string, string | number | boolean> {
  const globalObject = globalThis as { RC?: Record<string, unknown> };
  const source = globalObject.RC;
  if (!source || typeof source !== 'object') {
    return {};
  }
  const flags: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      flags[key] = value;
    }
  }
  return flags;
}

export async function submitReliabilityIssueReport(): Promise<IssueReportResult> {
  const [{ base, apiKey }, queue, deviceInfo, events] = await Promise.all([
    Promise.resolve(resolveRunsApiConfig()),
    getUploadQueueSummary().catch(() => null),
    gatherDeviceInfo().catch(() => ({ platform: Platform.OS })),
    Promise.resolve(recentReliabilityEvents(5 * 60 * 1_000)),
  ]);

  const payload = {
    recordedAt: new Date().toISOString(),
    queue,
    events,
    rc: collectRcFlags(),
    device: deviceInfo,
  };

  const url = `${base}/issues`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Issue report failed (${response.status})`);
  }

  const data = await response.json().catch(() => ({}));
  const idRaw = (data as { id?: unknown }).id;
  const id = typeof idRaw === 'string' ? idRaw : '';
  return { id };
}

export default submitReliabilityIssueReport;
