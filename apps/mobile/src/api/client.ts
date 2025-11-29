import { resolveApiBase, resolveApiKey } from '@app/config';

type HeadersObject = Record<string, string>;

function normalizeHeaders(headers: HeadersInit | undefined): HeadersObject {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers } as HeadersObject;
}

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolveApiBase();
  const apiKey = resolveApiKey();
  const headers: HeadersObject = {
    Accept: 'application/json',
    ...normalizeHeaders(init?.headers),
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  };

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const description = await response.text().catch(() => '');
    const message = description || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}
