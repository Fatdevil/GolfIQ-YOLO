import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyBagPage from "@web/pages/bag/MyBagPage";
import type { BagState } from "@web/bag/types";

type StorageModule = typeof import("@web/bag/storage");

const mockBag: BagState = {
  updatedAt: Date.now(),
  clubs: [
    { id: "7i", label: "7-järn", carry_m: null, notes: null },
    { id: "PW", label: "Pitching wedge", carry_m: 95, notes: null },
  ],
};

vi.mock("@web/bag/storage", () => {
  const updateClubCarry = vi.fn((bag: BagState, clubId: string, carry: number | null) => ({
    ...bag,
    updatedAt: Date.now(),
    clubs: bag.clubs.map((club) =>
      club.id === clubId ? { ...club, carry_m: carry } : club
    ),
  }));
  const upsertClub = vi.fn((bag: BagState, club: Partial<BagState["clubs"][number]> & { id: string }) => ({
    ...bag,
    updatedAt: Date.now(),
    clubs: bag.clubs.map((existing) =>
      existing.id === club.id ? { ...existing, ...club } : existing
    ),
  }));
  return {
    loadBag: vi.fn(() => mockBag),
    updateClubCarry,
    upsertClub,
  } satisfies Partial<StorageModule>;
});

let storage: StorageModule;

beforeAll(async () => {
  storage = await import("@web/bag/storage");
});

describe("MyBagPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders clubs and allows updating carry", () => {
    render(
      <MemoryRouter>
        <MyBagPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/My Bag/i)).toBeTruthy();
    expect(screen.getByDisplayValue("7-järn")).toBeTruthy();

    const row = screen.getByDisplayValue("7-järn").closest("tr");
    expect(row).not.toBeNull();
    const carryInput = within(row as HTMLElement).getByPlaceholderText("—") as HTMLInputElement;
    fireEvent.change(carryInput, { target: { value: "150" } });

    expect(storage.updateClubCarry).toHaveBeenCalledWith(expect.any(Object), "7i", 150);
  });
});
