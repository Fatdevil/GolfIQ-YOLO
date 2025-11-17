import { apiFetch } from "@/api";

export type QuickRoundSnapshot = {
  id: string;
  started_at: string;
  completed_at?: string | null;
  course_name?: string | null;
  total_strokes?: number | null;
  to_par?: number | null;
  net_to_par?: number | null;
};

export type RangeSessionSnapshot = {
  id: string;
  started_at: string;
  ended_at: string;
  club_id?: string | null;
  mission_id?: string | null;
  shot_count: number;
  avg_carry_m?: number | null;
  carry_std_m?: number | null;
};

export async function postQuickRoundSnapshots(
  items: QuickRoundSnapshot[]
): Promise<void> {
  if (items.length === 0) return;
  const res = await apiFetch("/api/user/history/quickrounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  if (!res.ok) {
    throw new Error(`postQuickRoundSnapshots failed: ${res.status}`);
  }
}

export async function postRangeSessionSnapshots(
  items: RangeSessionSnapshot[]
): Promise<void> {
  if (items.length === 0) return;
  const res = await apiFetch("/api/user/history/rangesessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  if (!res.ok) {
    throw new Error(`postRangeSessionSnapshots failed: ${res.status}`);
  }
}
