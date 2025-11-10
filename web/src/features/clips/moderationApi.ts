import axios from 'axios';

import { API, withAdminHeaders } from '@web/api';

export type Visibility = 'private' | 'event' | 'friends' | 'public';

export type ReportResponse = {
  id: string;
  clipId: string;
  ts: string;
  reason: string;
  status: string;
};

export type ClipModerationState = {
  clipId: string;
  hidden: boolean;
  visibility: Visibility;
  reports: number;
  updatedTs: string;
};

export type ModerationQueueOptions = {
  status?: 'open' | 'all';
  memberId?: string | null;
  signal?: AbortSignal;
};

export type ModerationActionPayload = {
  action: 'hide' | 'unhide' | 'set_visibility';
  visibility?: Visibility;
};

export const reportClip = async (
  clipId: string,
  payload: { reason: string; details?: Record<string, unknown>; reporter?: string | null },
): Promise<ReportResponse> => {
  const { data } = await axios.post<ReportResponse>(`${API}/clips/${clipId}/report`, payload);
  return data;
};

export const listModerationQueue = async (
  options: ModerationQueueOptions = {},
): Promise<ClipModerationState[]> => {
  const headers = withAdminHeaders({ memberId: options.memberId ?? undefined });
  const params = options.status ? { status: options.status } : undefined;
  const { data } = await axios.get<ClipModerationState[]>(`${API}/admin/moderation/queue`, {
    headers,
    params,
    signal: options.signal,
  });
  return data;
};

export const moderateClip = async (
  clipId: string,
  body: ModerationActionPayload,
  memberId?: string | null,
): Promise<ClipModerationState> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined });
  const { data } = await axios.post<ClipModerationState>(
    `${API}/admin/moderation/${clipId}/action`,
    body,
    { headers },
  );
  return data;
};
