import type { PlayerBag } from "@shared/caddie/playerBag";
import type { BagState } from "./types";

export function mapBagStateToPlayerBag(bag: BagState): PlayerBag {
  return {
    clubs: bag.clubs.map((club) => ({
      clubId: club.id,
      label: club.label,
      avgCarryM: club.carry_m ?? null,
      manualAvgCarryM: club.carry_m ?? null,
      sampleCount: 0,
      active: true,
    })),
  };
}
