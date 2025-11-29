export function resolveApiBase(): string {
  const envBase =
    process.env.MOBILE_API_BASE ??
    process.env.EXPO_PUBLIC_API_BASE ??
    process.env.API_BASE ??
    process.env.VITE_API_BASE;
  return typeof envBase === 'string' && envBase.trim().length > 0
    ? envBase.trim().replace(/\/$/, '')
    : 'http://localhost:8000';
}

export function resolveApiKey(): string | null {
  const key =
    process.env.MOBILE_API_KEY ??
    process.env.EXPO_PUBLIC_API_KEY ??
    process.env.API_KEY ??
    process.env.VITE_API_KEY;
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }
  return null;
}
