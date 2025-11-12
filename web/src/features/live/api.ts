import axios from 'axios';

import { API, withAdminHeaders, withAuth } from '@web/api';

export type StartLiveResponse = { hlsPath: string; startedAt: string };
export type StopLiveResponse = { stopped: boolean };
export type MintViewerTokenResponse = { token: string; exp: number };
export type CreateViewerLinkResponse = { url: string };
export type ExchangeInviteResponse = { token: string; exp: number };
export type LiveStatusResponse = {
  running: boolean;
  startedAt: string | null;
  viewers: number;
  hlsPath?: string | null;
};

export type LiveStateResponse = {
  isLive: boolean;
  viewerUrl: string | null;
  startedTs: number | null;
  updatedTs: number | null;
  streamId: string | null;
  latencyMode: string | null;
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

export const createViewerLink = (
  eventId: string,
  memberId: string | null | undefined,
) =>
  axios
    .get<CreateViewerLinkResponse>(`${API}/events/${eventId}/live/viewer_link`, {
      headers: withAdminHeaders({ memberId: memberId ?? undefined }),
    })
    .then((response) => response.data);

export const getLiveState = (eventId: string) =>
  axios
    .get<LiveStateResponse>(`${API}/events/${eventId}/live`, {
      headers: withAuth(),
    })
    .then((response) => response.data);

export type LiveHeartbeatBody = {
  streamId?: string | null;
  viewerUrl?: string | null;
  latencyMode?: string | null;
};

export const postLiveHeartbeat = (
  eventId: string,
  memberId: string | null | undefined,
  body: LiveHeartbeatBody = {},
) =>
  axios
    .post<LiveStateResponse>(`${API}/events/${eventId}/live/heartbeat`, body, {
      headers: withAdminHeaders({ memberId: memberId ?? undefined, includeJson: true }),
    })
    .then((response) => response.data);

export const exchangeViewerInvite = (eventId: string, invite: string) =>
  axios
    .post<ExchangeInviteResponse>(
      `${API}/events/${eventId}/live/exchange_invite`,
      { invite },
      {
        headers: withAuth({ 'Content-Type': 'application/json' }),
      },
    )
    .then((response) => response.data);
