import { API, getApiKey } from "@/api";

export type QuickRoundSyncIn = {
  memberId: string;
  runId: string;
  courseId?: string | null;
  hole: number;
};

export type QuickRoundSyncOut = {
  deviceId: string | null;
  synced: boolean;
};

export async function syncQuickRoundToWatch(
  payload: QuickRoundSyncIn
): Promise<QuickRoundSyncOut> {
  const apiKey = getApiKey();
  const response = await fetch(`${API}/api/watch/quickround/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`syncQuickRoundToWatch failed: ${response.status}`);
  }

  return (await response.json()) as QuickRoundSyncOut;
}
