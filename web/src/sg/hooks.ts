import * as React from 'react';

import { getApiKey } from '@web/api';

export type ShotSG = { hole: number; shot: number; sg_delta: number };
export type HoleSG = { hole: number; sg: number; shots: ShotSG[] };
export type RunSG = { runId?: string; holes: HoleSG[]; total_sg: number; shots?: ShotSG[] };

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

const sgCacheKey = (runId: string) => `sg:${runId}`;
const anchorCacheKey = (runId: string) => `anc:${runId}`;

export function getCachedRunSG(runId: string): RunSG | undefined {
  if (!runId) {
    return undefined;
  }
  return _cache.get(sgCacheKey(runId)) as RunSG | undefined;
}

export function setCachedRunSG(runId: string, value: RunSG): void {
  if (!runId) {
    return;
  }
  _cache.set(sgCacheKey(runId), value);
}

export function getCachedAnchors(runId: string): Anchor[] | undefined {
  if (!runId) {
    return undefined;
  }
  return _cache.get(anchorCacheKey(runId)) as Anchor[] | undefined;
}

export function setCachedAnchors(runId: string, value: Anchor[]): void {
  if (!runId) {
    return;
  }
  _cache.set(anchorCacheKey(runId), value);
}

export function useRunSG(runId: string) {
  const normalizedRunId = typeof runId === 'string' && runId ? runId : '';
  const initialData = React.useMemo(() => getCachedRunSG(normalizedRunId), [normalizedRunId]);

  const [data, setData] = React.useState<RunSG | undefined>(initialData);
  const [loading, setLoading] = React.useState(!initialData && !!normalizedRunId);
  const [error, setError] = React.useState<Error | undefined>();

  React.useEffect(() => {
    if (!normalizedRunId) {
      setData(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    const cached = getCachedRunSG(normalizedRunId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const value = await fetchRunSG(normalizedRunId);
        if (!alive) {
          return;
        }
        setCachedRunSG(normalizedRunId, value);
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

    return () => {
      alive = false;
    };
  }, [normalizedRunId]);

  return { data, loading, error };
}

export function useAnchors(runId: string) {
  const normalizedRunId = typeof runId === 'string' && runId ? runId : '';
  const initialData = React.useMemo(() => getCachedAnchors(normalizedRunId), [normalizedRunId]);

  const [data, setData] = React.useState<Anchor[] | undefined>(initialData);
  const [loading, setLoading] = React.useState(!initialData && !!normalizedRunId);
  const [error, setError] = React.useState<Error | undefined>();

  React.useEffect(() => {
    if (!normalizedRunId) {
      setData(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    const cached = getCachedAnchors(normalizedRunId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const value = await fetchAnchors(normalizedRunId);
        if (!alive) {
          return;
        }
        setCachedAnchors(normalizedRunId, value);
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

    return () => {
      alive = false;
    };
  }, [normalizedRunId]);

  return { data, loading, error };
}

export const __testing = {
  clearCache() {
    _cache.clear();
  },
};
