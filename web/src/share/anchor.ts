import { getApiKey } from '@web/api';
import { copyToClipboard } from '@web/utils/copy';
import { toast } from '@web/ui/toast';

import { emitTelemetry } from './telemetry';

export type AnchorShareParams = {
  runId: string;
  hole: number;
  shot: number;
};

export type AnchorShareResult = {
  link: string;
  ogUrl: string;
  sid: string;
};

function absoluteUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).toString();
  } catch (_error) {
    return url;
  }
}

function resolveOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

export async function shareAnchor({ runId, hole, shot }: AnchorShareParams): Promise<AnchorShareResult | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  try {
    const response = await fetch('/api/share/anchor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ runId, hole, shot }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        toast.error('Cannot share non-public clip');
      } else {
        toast.error('Unable to share this clip');
      }
      return null;
    }

    const payload = (await response.json()) as { sid?: string; url: string; ogUrl?: string };
    const origin = resolveOrigin();
    const link = absoluteUrl(payload.url, origin);
    const ogLink = payload.ogUrl ? absoluteUrl(payload.ogUrl, origin) : link;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'GolfIQ', text: 'Check this shot', url: link });
      } else {
        await copyToClipboard(link);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[share/anchor] share interaction failed', error);
      }
    }

    emitTelemetry('share.anchor.ui', { runId, hole, shot, sid: payload.sid ?? null });

    return {
      link,
      ogUrl: ogLink,
      sid: payload.sid ?? '',
    };
  } catch (error) {
    toast.error('Unable to share this clip');
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[share/anchor] request failed', error);
    }
    return null;
  }
}
