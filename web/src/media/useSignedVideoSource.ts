import { useEffect, useState } from "react";

import type { SignedPlaybackUrl } from "./sign";
import { getSignedPlaybackUrl } from "./sign";

type SignedVideoState = Omit<SignedPlaybackUrl, "url"> & { url: string | null; loading: boolean };

export function useSignedVideoSource(rawUrl: string | null | undefined): SignedVideoState {
  const [state, setState] = useState<SignedVideoState>(() => ({
    url: rawUrl ?? null,
    path: null,
    signed: false,
    exp: null,
    loading: Boolean(rawUrl),
  }));

  useEffect(() => {
    let active = true;
    if (!rawUrl) {
      setState({ url: null, path: null, signed: false, exp: null, loading: false });
      return () => {
        active = false;
      };
    }

    setState({ url: null, path: null, signed: false, exp: null, loading: true });

    getSignedPlaybackUrl(rawUrl)
      .then((result) => {
        if (!active) {
          return;
        }
        setState({ ...result, url: result.url, loading: false });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[media/sign] unexpected signer failure", error);
        }
        setState({ url: rawUrl ?? null, path: null, signed: false, exp: null, loading: false });
      });

    return () => {
      active = false;
    };
  }, [rawUrl]);

  return state;
}
