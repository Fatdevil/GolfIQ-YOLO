export type ClubId =
  | "D"
  | "3W"
  | "5W"
  | "4i"
  | "5i"
  | "6i"
  | "7i"
  | "8i"
  | "9i"
  | "PW"
  | "GW"
  | "SW";

export type Bag = { [K in ClubId]: number };

const CLUB_SEQUENCE_ASC: readonly ClubId[] = [
  "SW",
  "GW",
  "PW",
  "9i",
  "8i",
  "7i",
  "6i",
  "5i",
  "4i",
  "5W",
  "3W",
  "D",
];

const sanitizeCarry = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : 0;
};

export const defaultBag = (): Bag => ({
  D: 235,
  "3W": 220,
  "5W": 205,
  "4i": 190,
  "5i": 180,
  "6i": 170,
  "7i": 155,
  "8i": 145,
  "9i": 135,
  PW: 120,
  GW: 105,
  SW: 90,
});

export const suggestClub = (bag: Bag, playsLike_m: number): ClubId => {
  const target = Number.isFinite(playsLike_m) ? Math.max(0, playsLike_m) : 0;
  let fallback: ClubId = CLUB_SEQUENCE_ASC[CLUB_SEQUENCE_ASC.length - 1];
  for (const club of CLUB_SEQUENCE_ASC) {
    const carry = sanitizeCarry(bag[club]);
    if (carry > 0) {
      fallback = club;
    }
    if (carry >= target && carry > 0) {
      return club;
    }
  }
  return fallback;
};

export const CLUB_SEQUENCE = CLUB_SEQUENCE_ASC;
