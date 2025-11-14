export type ClubId =
  | "DR"
  | "3W"
  | "5W"
  | "3H"
  | "4H"
  | "3i"
  | "4i"
  | "5i"
  | "6i"
  | "7i"
  | "8i"
  | "9i"
  | "PW"
  | "GW"
  | "SW"
  | "LW"
  | "Putter"
  | string;

export interface BagClub {
  id: ClubId;
  label: string;
  carry_m: number | null;
  notes?: string | null;
}

export interface BagState {
  updatedAt: number;
  clubs: BagClub[];
}

export function createDefaultBag(): BagState {
  return {
    updatedAt: Date.now(),
    clubs: [
      { id: "DR", label: "Driver", carry_m: null },
      { id: "3W", label: "3-wood", carry_m: null },
      { id: "5W", label: "5-wood", carry_m: null },
      { id: "4H", label: "Hybrid 4", carry_m: null },
      { id: "5i", label: "5-j\u00e4rn", carry_m: null },
      { id: "6i", label: "6-j\u00e4rn", carry_m: null },
      { id: "7i", label: "7-j\u00e4rn", carry_m: null },
      { id: "8i", label: "8-j\u00e4rn", carry_m: null },
      { id: "9i", label: "9-j\u00e4rn", carry_m: null },
      { id: "PW", label: "Pitching wedge", carry_m: null },
      { id: "GW", label: "Gap wedge", carry_m: null },
      { id: "SW", label: "Sand wedge", carry_m: null },
      { id: "LW", label: "Lob wedge", carry_m: null },
      { id: "Putter", label: "Putter", carry_m: null },
    ],
  };
}
