import axios from 'axios';

import { API, withAdminHeaders, withAuth } from '@web/api';

export type StartLiveResponse = { hlsPath: string; startedAt: string };
export type StopLiveResponse = { stopped: boolean };
export type MintViewerTokenResponse = { token: string; exp: number };
export type LiveStatusResponse = {
  running: boolean;
  startedAt?: string | null;
  hlsPath?: string | null;
};

export const startLive = (
  eventId: string,
  memberId: string | null | undefined,
  source: string = 'mock',
) =>
  axios
    .post<StartLiveResponse>(
      `${API}/events/${eventId}/live/start`,
      { source },
      {
        headers: withAdminHeaders({
          memberId: memberId ?? undefined,
          includeJson: true,
        }),
      },
    )
    .then((response) => response.data);

export const stopLive = (eventId: string, memberId: string | null | undefined) =>
  axios
    .post<StopLiveResponse>(`${API}/events/${eventId}/live/stop`, null, {
      headers: withAdminHeaders({ memberId: memberId ?? undefined }),
    })
    .then((response) => response.data);

export const mintViewerToken = (
  eventId: string,
  memberId: string | null | undefined,
  ttl?: number,
) =>
  axios
    .post<MintViewerTokenResponse>(
      `${API}/events/${eventId}/live/token`,
      ttl ? { ttl } : undefined,
      {
        headers: withAdminHeaders({
          memberId: memberId ?? undefined,
          includeJson: Boolean(ttl),
        }),
      },
    )
    .then((response) => response.data);

export const getLiveStatus = (eventId: string, token?: string | null) =>
  axios
    .get<LiveStatusResponse>(`${API}/events/${eventId}/live/status`, {
      headers: withAuth(),
      params: token ? { token } : undefined,
    })
    .then((response) => response.data);
