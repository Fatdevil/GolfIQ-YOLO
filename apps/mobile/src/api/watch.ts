import { apiFetch } from '@app/api/client';

export interface WatchPairCode {
  code: string;
  expiresAt: string;
}

export interface WatchDeviceStatus {
  paired: boolean;
  lastSeenAt?: string | null;
}

export async function requestWatchPairCode(memberId: string): Promise<WatchPairCode> {
  const response = await apiFetch<{ code: string; expTs: number }>(
    `/api/watch/pair/code?memberId=${encodeURIComponent(memberId)}`,
    {
      method: 'POST',
    },
  );

  return {
    code: response.code,
    expiresAt: new Date(response.expTs * 1000).toISOString(),
  };
}

export async function fetchWatchStatus(memberId: string): Promise<WatchDeviceStatus> {
  return apiFetch<WatchDeviceStatus>(
    `/api/watch/devices/status?memberId=${encodeURIComponent(memberId)}`,
  );
}
