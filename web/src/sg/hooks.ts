import * as React from 'react';

import { getApiKey } from '@web/api';

export type ShotSG = { hole: number; shot: number; sg_delta: number };
export type HoleSG = { hole: number; sg: number; shots: ShotSG[] };
export type RunSG = { holes: HoleSG[]; total_sg: number };

export type Anchor = {
  runId: string;
  hole: number;
  shot: number;
  clipId: string;
  tStartMs: number;
  tEndMs: number;
  version: number;
  ts: number;
};

const authHeaders = (): Record<string, string> => {
  const apiKey = getApiKey();
  return apiKey ? { 'x-api-key': apiKey } : {};
};

export async function fetchRunSG(runId: string): Promise<RunSG> {
  const response = await fetch(`/api/runs/${runId}/sg`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error('fetchRunSG failed');
  }
  return response.json();
}

export async function fetchAnchors(runId: string): Promise<Anchor[]> {
  const response = await fetch(`/api/runs/${runId}/anchors`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error('fetchAnchors failed');
  }
  return response.json();
}

/** Tiny cache-in-memory for a session; bust on route change if needed */
const _cache = new Map<string, unknown>();

export function useRunSG(runId: string) {
  const cacheKey = React.useMemo(() => (runId ? `sg:${runId}` : ''), [runId]);
  const initialData = React.useMemo(() => {
    if (!cacheKey) return undefined;
    return _cache.get(cacheKey) as RunSG | undefined;
  }, [cacheKey]);

  const [data, setData] = React.useState<RunSG | undefined>(initialData);
  const [loading, setLoading] = React.useState(!initialData && !!runId);
  const [error, setError] = React.useState<Error | undefined>();

  React.useEffect(() => {
    if (!runId || !cacheKey) {
      return undefined;
    }
    let alive = true;
    if (!data) {
      (async () => {
        try {
          setLoading(true);
          const value = await fetchRunSG(runId);
          if (!alive) return;
          _cache.set(cacheKey, value);
          setData(value);
          setError(undefined);
        } catch (err) {
          if (alive) {
            setError(err as Error);
          }
        } finally {
          if (alive) {
            setLoading(false);
          }
        }
      })();
    }
    return () => {
      alive = false;
    };
  }, [cacheKey, data, runId]);

  return { data, loading, error };
}

export function useAnchors(runId: string) {
  const cacheKey = React.useMemo(() => (runId ? `anc:${runId}` : ''), [runId]);
  const initialData = React.useMemo(() => {
    if (!cacheKey) return undefined;
    return _cache.get(cacheKey) as Anchor[] | undefined;
  }, [cacheKey]);

  const [data, setData] = React.useState<Anchor[] | undefined>(initialData);
  const [loading, setLoading] = React.useState(!initialData && !!runId);
  const [error, setError] = React.useState<Error | undefined>();

  React.useEffect(() => {
    if (!runId || !cacheKey) {
      return undefined;
    }
    let alive = true;
    if (!data) {
      (async () => {
        try {
          setLoading(true);
          const value = await fetchAnchors(runId);
          if (!alive) return;
          _cache.set(cacheKey, value);
          setData(value);
          setError(undefined);
        } catch (err) {
          if (alive) {
            setError(err as Error);
          }
        } finally {
          if (alive) {
            setLoading(false);
          }
        }
      })();
    }
    return () => {
      alive = false;
    };
  }, [cacheKey, data, runId]);

  return { data, loading, error };
}

export const __testing = {
  clearCache() {
    _cache.clear();
  },
};
