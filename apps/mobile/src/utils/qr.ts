import { validateCode } from '@shared/events/code';

export function extractJoinCode(payload: string | null | undefined): string | null {
  try {
    const s = String(payload ?? '').trim();
    if (!s) {
      return null;
    }
    const m1 = s.match(/golfiq:\/\/join\/([A-Za-z0-9]+)/i);
    const m2 = s.match(/(?:^|\/)join\/([A-Za-z0-9]+)/i);
    const raw = m1?.[1] ?? m2?.[1] ?? s;
    const candidate = raw.trim().toUpperCase();
    return validateCode(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
