import { useEffect, useState } from "react";

import { getApiKey } from "@web/api";

import type { CourseBundle } from "./types";
import { loadBundleFromCache, saveBundleToCache } from "./storage";

const authHeaders = (): Record<string, string> => {
  const apiKey = getApiKey();
  return apiKey ? { "x-api-key": apiKey } : {};
};

export function useCourseIds() {
  const [data, setData] = useState<string[] | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/courses", { headers: authHeaders() });
        if (!active) {
          return;
        }
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const ids = (await res.json()) as string[];
        setData(ids);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err as Error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}

export function useCourseBundle(courseId: string | undefined) {
  const [data, setData] = useState<CourseBundle | undefined>();
  const [loading, setLoading] = useState<boolean>(!!courseId);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!courseId) {
      setData(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    const cached = loadBundleFromCache(courseId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(undefined);
    } else {
      setLoading(true);
      setError(undefined);
      setData(undefined);
    }

    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/bundle`, {
          headers: authHeaders(),
        });
        if (!active) {
          return;
        }
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const bundle = (await res.json()) as CourseBundle;
        saveBundleToCache(bundle);
        setData(bundle);
        setError(undefined);
      } catch (err) {
        if (!active) {
          return;
        }
        if (!cached) {
          setError(err as Error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  return { data, loading, error };
}
