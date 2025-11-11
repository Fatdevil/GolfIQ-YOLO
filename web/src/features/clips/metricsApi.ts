import axios from 'axios';

import { API, withAdminHeaders } from '@web/api';

import type { ShotClip } from './types';

export type ClipMetricsPayload = {
  startDistM: number;
  endDistM?: number | null;
  strokesUsed: number;
  lieStart?: string;
};

export type ClipMetricsResponse = {
  sgDelta: number;
  anchorSec: number;
};

export type ClipWithMetrics = ShotClip & {
  sgDelta?: number | null;
  anchors?: number[] | null;
};

export const postClipMetrics = async (
  clipId: string,
  payload: ClipMetricsPayload,
  memberId?: string | null,
): Promise<ClipMetricsResponse> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined, includeJson: true });
  const { data } = await axios.post<ClipMetricsResponse>(`${API}/clips/${clipId}/metrics`, payload, { headers });
  return data;
};

export const getClipWithMetrics = async (
  clipId: string,
  memberId?: string | null,
): Promise<ClipWithMetrics> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined });
  const { data } = await axios.get<ClipWithMetrics>(`${API}/clips/${clipId}`, { headers });
  return data;
};

export type TopShotClip = ClipWithMetrics & { score: number };

export const getEventTopShots = async (
  eventId: string,
  memberId?: string | null,
  params?: { alpha?: number; beta?: number; gamma?: number },
): Promise<TopShotClip[]> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined });
  const { data } = await axios.get<TopShotClip[]>(`${API}/events/${eventId}/top-shots`, {
    headers,
    params,
  });
  return data;
};
