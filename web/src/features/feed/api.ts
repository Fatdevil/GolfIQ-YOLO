import axios from "axios";

import { API, withAuth } from "@web/api";

export type HomeFeedTopShot = {
  clipId: string;
  eventId: string | null;
  sgDelta: number | null;
  reactions1min: number;
  reactionsTotal: number;
  createdAt: string | null;
  anchorSec: number;
  rankScore: number;
};

export type HomeFeedLiveEvent = {
  eventId: string;
  viewers: number;
  startedAt: string | null;
  livePath?: string | null;
};

export type HomeFeedResponse = {
  topShots: HomeFeedTopShot[];
  live: HomeFeedLiveEvent[];
  updatedAt: string;
  etag: string;
};

type FetchHomeFeedOptions = {
  limit?: number;
  signal?: AbortSignal;
  bustCache?: boolean;
};

type FeedCache = {
  etag: string | null;
  payload: HomeFeedResponse | null;
};

const cache: FeedCache = {
  etag: null,
  payload: null,
};

export async function fetchHomeFeed(options: FetchHomeFeedOptions = {}): Promise<HomeFeedResponse> {
  const headers: Record<string, string> = withAuth();
  if (cache.etag && !options.bustCache) {
    headers["If-None-Match"] = cache.etag;
  }

  const response = await axios.get<HomeFeedResponse>(`${API}/feed/home`, {
    headers,
    params: options.limit ? { limit: options.limit } : undefined,
    signal: options.signal,
    validateStatus: (status) => status === 200 || status === 304,
  });

  if (response.status === 304) {
    if (cache.payload) {
      return cache.payload;
    }
    throw new Error("Home feed cache unavailable for 304 response");
  }

  const etagHeader = response.headers?.etag ?? response.headers?.ETag ?? null;
  cache.etag = typeof etagHeader === "string" ? etagHeader : null;
  cache.payload = response.data;
  return response.data;
}

export const __testing = {
  clearCache(): void {
    cache.etag = null;
    cache.payload = null;
  },
};
