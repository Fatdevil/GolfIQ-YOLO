import { BagState, BagClub, createDefaultBag } from "./types";

const STORAGE_KEY = "golfiq.bag.v1";

export function loadBag(): BagState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultBag();
    const parsed = JSON.parse(raw) as BagState;
    if (!parsed || !Array.isArray(parsed.clubs)) return createDefaultBag();
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return createDefaultBag();
  }
}

export function saveBag(bag: BagState): BagState {
  const next: BagState = { ...bag, updatedAt: Date.now() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function updateClubCarry(
  bag: BagState,
  clubId: string,
  carry_m: number | null
): BagState {
  const clubs = bag.clubs.map((c) => (c.id === clubId ? { ...c, carry_m } : c));
  const next: BagState = { ...bag, clubs };
  return saveBag(next);
}

export function upsertClub(
  bag: BagState,
  club: Partial<BagClub> & { id: string }
): BagState {
  const existingIndex = bag.clubs.findIndex((c) => c.id === club.id);
  let clubs = [...bag.clubs];
  if (existingIndex >= 0) {
    clubs[existingIndex] = { ...bag.clubs[existingIndex], ...club };
  } else {
    const nextClub: BagClub = {
      id: club.id,
      label: club.label ?? club.id,
      carry_m: club.carry_m ?? null,
      notes: club.notes ?? null,
    };
    clubs.push(nextClub);
  }
  const next: BagState = { ...bag, clubs };
  return saveBag(next);
}

export function clearBagStorageForTests() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
