import { validateCode } from '@shared/events/code';

export function extractJoinCode(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.trim();
  if (!normalized) {
    return null;
  }
  const noQuery = normalized.split('?')[0] ?? '';
  const [, path = ''] = noQuery.split('://');
  const cleanPath = (path || noQuery).replace(/^\//, '');
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  if (segments[0]?.toLowerCase() !== 'join') {
    return null;
  }
  const code = segments[1] ?? '';
  const candidate = code.trim().toUpperCase();
  if (!candidate) {
    return null;
  }
  return validateCode(candidate) ? candidate : null;
}
