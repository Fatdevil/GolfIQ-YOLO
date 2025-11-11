import { useEffect, useState } from "react";

import { extractSignablePath, signHls } from "./sign";

export type SignedVideoState = {
  url: string | null;
  path: string | null;
  signed: boolean;
  exp: number | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_STATE: SignedVideoState = {
  url: null,
  path: null,
  signed: false,
  exp: null,
  loading: false,
  error: null,
};

function isFallbackEnabled(): boolean {
  return import.meta.env.VITE_MEDIA_SIGN_DEV_FALLBACK === "true";
}

export function useSignedVideoSource(rawUrl: string | null | undefined): SignedVideoState {
  const [state, setState] = useState<SignedVideoState>(() => ({
    ...EMPTY_STATE,
    loading: Boolean(rawUrl),
  }));

  useEffect(() => {
    let cancelled = false;

    if (!rawUrl) {
      setState({ ...EMPTY_STATE });
      return () => {
        cancelled = true;
      };
    }

    const path = extractSignablePath(rawUrl);

    setState({
      ...EMPTY_STATE,
      path,
      loading: true,
    });

    if (!path) {
      const fallback = isFallbackEnabled();
      setState({
        ...EMPTY_STATE,
        url: fallback ? rawUrl : null,
        path: null,
        loading: false,
        error: fallback ? "fallback" : "invalid_path",
      });
      return () => {
        cancelled = true;
      };
    }

    signHls(path)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setState({
          url: payload.url,
          path,
          signed: true,
          exp: payload.exp ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(`[media/sign] failed to sign ${path}`, error);
        }
        const fallback = isFallbackEnabled();
        if (fallback) {
          setState({
            url: rawUrl,
            path,
            signed: false,
            exp: null,
            loading: false,
            error: "fallback",
          });
          return;
        }
        setState({
          url: null,
          path,
          signed: false,
          exp: null,
          loading: false,
          error: "sign_failed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [rawUrl]);

  return state;
}
