const DEFAULT_BASE = "/static";

function normalizeBase(candidate: string | undefined | null): string {
  if (!candidate) {
    return "";
  }
  const trimmed = candidate.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const normalizedBase = normalizeBase(import.meta.env.VITE_HLS_BASE ?? DEFAULT_BASE);

export type SignResponse = { url: string; exp: number };

export async function signHls(path: string): Promise<SignResponse> {
  const response = await fetch(`/media/sign?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    const error = new Error(`sign ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return response.json();
}

export function extractSignablePath(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const pathname = parsed.pathname || "";
    if (pathname.startsWith("/hls/")) {
      return pathname;
    }
    if (pathname.startsWith("/media/")) {
      return pathname;
    }
    if (normalizedBase && pathname.startsWith(`${normalizedBase}/hls/`)) {
      return pathname.slice(normalizedBase.length);
    }
    if (normalizedBase && pathname.startsWith(`${normalizedBase}/media/`)) {
      return pathname.slice(normalizedBase.length);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[media/sign] failed to parse URL", error);
    }
  }
  return null;
}

export type SignedPlaybackUrl = {
  url: string;
  path: string | null;
  signed: boolean;
  exp: number | null;
  error?: unknown;
};

export async function getSignedPlaybackUrl(rawUrl: string): Promise<SignedPlaybackUrl> {
  const path = extractSignablePath(rawUrl);
  if (!path) {
    return { url: rawUrl, path: null, signed: false, exp: null };
  }
  try {
    const payload = await signHls(path);
    if (!payload?.url) {
      throw new Error("missing url in signer response");
    }
    return { url: payload.url, path, signed: true, exp: payload.exp ?? null };
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[media/sign] falling back to unsigned playback", error);
    }
    return { url: rawUrl, path, signed: false, exp: null, error };
  }
}

export function getNormalizedHlsBase(): string {
  return normalizedBase;
}
