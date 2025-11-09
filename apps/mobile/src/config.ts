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
