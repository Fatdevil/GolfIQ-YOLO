import { useEffect } from 'react';

const injected = new Set<string>();

function ensureLink(rel: 'preconnect' | 'dns-prefetch', href: string): void {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (rel === 'preconnect') {
    link.crossOrigin = '';
  }
  document.head.appendChild(link);
}

function normalizeCdn(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin;
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[media/cdn] invalid CDN base', error);
    }
    return null;
  }
}

export function useCdnPreconnect(): void {
  useEffect(() => {
    const origin = normalizeCdn(import.meta.env.VITE_MEDIA_CDN_BASE_URL);
    if (!origin || injected.has(origin)) {
      return;
    }
    injected.add(origin);
    ensureLink('preconnect', origin);
    ensureLink('dns-prefetch', origin);
  }, []);
}
