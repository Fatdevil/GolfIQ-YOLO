import { Buffer } from 'buffer';

export type ReelShareOptions = {
  baseUrl?: string;
};

const DEFAULT_BASE_URL = 'https://golfiq-yolo.app/reels';

function encodePayload(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    const base = Buffer.from(json, 'utf8').toString('base64');
    return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  } catch (error) {
    return '';
  }
}

export function buildShareUrl(payload: unknown, options?: ReelShareOptions): string {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const encoded = encodePayload(payload ?? {});
  if (!encoded) {
    return baseUrl;
  }
  const join = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${join}payload=${encoded}`;
}
