import type { BagClub, BagState } from "@/bag/types";
import type { RangeSession } from "@/features/range/sessions";

export type CarrySuggestion = {
  clubId: string;
  clubLabel: string;
  currentCarry_m: number | null;
  suggestedCarry_m: number;
  sampleCount: number;
};

export function computeCarrySuggestions(
  bag: BagState,
  sessions: RangeSession[]
): CarrySuggestion[] {
  const byClub: Record<string, { carries: number[] }> = {};

  for (const session of sessions) {
    const clubId = session.clubId;
    if (!clubId) continue;

    const avgCarry = session.avgCarry_m;
    if (avgCarry == null || !Number.isFinite(avgCarry)) continue;

    const shotCount = session.shotCount ?? 0;
    if (shotCount < 5) continue;

    if (!byClub[clubId]) {
      byClub[clubId] = { carries: [] };
    }
    byClub[clubId].carries.push(avgCarry);
  }

  const suggestions: CarrySuggestion[] = [];

  for (const [clubId, aggregate] of Object.entries(byClub)) {
    if (aggregate.carries.length === 0) continue;

    const average =
      aggregate.carries.reduce((total, value) => total + value, 0) /
      aggregate.carries.length;

    const club: BagClub | undefined = bag.clubs.find((item) => item.id === clubId);
    if (!club) continue;

    const current = club.carry_m ?? null;

    if (current != null) {
      const diff = Math.abs(average - current);
      if (diff < 5) continue;
    }

    suggestions.push({
      clubId,
      clubLabel: club.label,
      currentCarry_m: current,
      suggestedCarry_m: Math.round(average),
      sampleCount: aggregate.carries.length,
    });
  }

  suggestions.sort((a, b) => {
    const diffA =
      a.currentCarry_m != null
        ? Math.abs(a.suggestedCarry_m - a.currentCarry_m)
        : 999;
    const diffB =
      b.currentCarry_m != null
        ? Math.abs(b.suggestedCarry_m - b.currentCarry_m)
        : 999;
    return diffB - diffA;
  });

  return suggestions;
}
