import { API, withAuth } from "@/api";

export interface PlayerSessionListItem {
  sessionId: string;
  userId: string;
  startedAt: string | null;
  endedAt: string | null;
  totalShots: number;
  onTargetShots: number;
  onTargetPercent: number;
}

export interface SessionSummary extends PlayerSessionListItem {}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const data = await response.json();
  return data as T;
}

export async function fetchPlayerSessions(
  baseUrl: string = API,
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<PlayerSessionListItem[]> {
  const url = `${baseUrl}/session/list?user_id=${encodeURIComponent(userId)}`;
  const response = await fetcher(url, { headers: withAuth() });
  const raw = await handleResponse<any[]>(response);
  return raw.map((item) => ({
    sessionId: item.session_id ?? item.sessionId,
    userId: item.user_id ?? item.userId,
    startedAt: item.started_at ?? item.startedAt ?? null,
    endedAt: item.ended_at ?? item.endedAt ?? null,
    totalShots: item.total_shots ?? item.totalShots ?? 0,
    onTargetShots: item.on_target_shots ?? item.onTargetShots ?? 0,
    onTargetPercent: item.on_target_percent ?? item.onTargetPercent ?? 0,
  }));
}

export async function fetchSessionSummary(
  baseUrl: string = API,
  sessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<SessionSummary> {
  const url = `${baseUrl}/session/${encodeURIComponent(sessionId)}/summary`;
  const response = await fetcher(url, { headers: withAuth() });
  const item = await handleResponse<any>(response);

  return {
    sessionId: item.session_id ?? item.sessionId,
    userId: item.user_id ?? item.userId,
    startedAt: item.started_at ?? item.startedAt ?? null,
    endedAt: item.ended_at ?? item.endedAt ?? null,
    totalShots: item.total_shots ?? item.totalShots ?? 0,
    onTargetShots: item.on_target_shots ?? item.onTargetShots ?? 0,
    onTargetPercent: item.on_target_percent ?? item.onTargetPercent ?? 0,
  };
}
