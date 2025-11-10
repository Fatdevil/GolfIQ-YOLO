import axios from 'axios';

import { API, withAdminHeaders } from '@web/api';

export type CommentaryStatus = 'queued' | 'running' | 'ready' | 'failed' | 'blocked_safe';

export type ClipCommentary = {
  clipId: string;
  status: CommentaryStatus;
  title?: string | null;
  summary?: string | null;
  ttsUrl?: string | null;
  updatedTs: string;
};

export type ListCommentaryOptions = {
  status?: CommentaryStatus;
  memberId?: string | null;
  signal?: AbortSignal;
};

export const listClipCommentaries = async (
  eventId: string,
  options: ListCommentaryOptions = {},
): Promise<ClipCommentary[]> => {
  const headers = withAdminHeaders({ memberId: options.memberId ?? undefined });
  const params = options.status ? { status: options.status } : undefined;
  const { data } = await axios.get<ClipCommentary[]>(`${API}/events/${eventId}/clips`, {
    headers,
    params,
    signal: options.signal,
  });
  return data;
};

export const getClipCommentary = async (
  clipId: string,
  memberId?: string | null,
  signal?: AbortSignal,
): Promise<ClipCommentary> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined });
  const { data } = await axios.get<ClipCommentary>(`${API}/clips/${clipId}/commentary`, {
    headers,
    signal,
  });
  return data;
};

export const postClipCommentaryPlay = async (
  clipId: string,
  memberId?: string | null,
): Promise<void> => {
  const headers = withAdminHeaders({ memberId: memberId ?? undefined });
  await axios.post(`${API}/clips/${clipId}/commentary/play`, null, { headers });
};
