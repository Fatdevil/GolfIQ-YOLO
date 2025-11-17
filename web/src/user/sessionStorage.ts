export type UserSession = {
  userId: string;
  createdAt: string; // ISO
};

const STORAGE_KEY = "golfiq.user.session.v1";

export function loadUserSession(): UserSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserSession>;
    if (!parsed.userId || typeof parsed.userId !== "string") return null;
    return {
      userId: parsed.userId,
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveUserSession(session: UserSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function createNewUserSession(): UserSession {
  const userId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `u-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
  const session: UserSession = {
    userId,
    createdAt: new Date().toISOString(),
  };
  saveUserSession(session);
  return session;
}
