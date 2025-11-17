let cachedUserId: string | null = null;

export function setCurrentUserId(id: string | null) {
  cachedUserId = id;
}

export function getCurrentUserId(): string | null {
  return cachedUserId;
}
