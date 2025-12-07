import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyBagPage from "@web/pages/bag/MyBagPage";
import type { BagState } from "@web/bag/types";
import { UnitsContext } from "@web/preferences/UnitsContext";

type StorageModule = typeof import("@web/bag/storage");
type BagStatsModule = typeof import("@/api/bagStatsClient");

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

vi.mock("@/api/bagStatsClient", () => ({
  fetchBagStats: vi.fn(),
}));

let storage: StorageModule;
let bagStatsClient: BagStatsModule;
let fetchBagStatsMock: ReturnType<typeof vi.fn>;

const loadBagMock = () => storage.loadBag as unknown as ReturnType<typeof vi.fn>;
const updateClubCarryMock = () =>
  storage.updateClubCarry as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
});

beforeAll(async () => {
  storage = await import("@web/bag/storage");
  bagStatsClient = await import("@/api/bagStatsClient");
  fetchBagStatsMock = bagStatsClient.fetchBagStats as unknown as ReturnType<typeof vi.fn>;
});

describe("MyBagPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBagMock().mockReturnValue(mockBag);
    fetchBagStatsMock.mockResolvedValue({});
  });

  it("renders clubs and allows updating carry", () => {
    render(
      <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
        <MemoryRouter>
          <MyBagPage />
        </MemoryRouter>
      </UnitsContext.Provider>
    );

    expect(screen.getByText(/My Bag/i)).toBeTruthy();
    expect(screen.getByDisplayValue("7-järn")).toBeTruthy();

    const row = screen.getByDisplayValue("7-järn").closest("tr");
    expect(row).not.toBeNull();
    const carryInput = within(row as HTMLElement).getByPlaceholderText("—") as HTMLInputElement;
    fireEvent.change(carryInput, { target: { value: "150" } });

    expect(storage.updateClubCarry).toHaveBeenCalledWith(expect.any(Object), "7i", 150);
  });

  it("converts imperial inputs to meters while displaying yards", () => {
    const imperialBag: BagState = {
      updatedAt: Date.now(),
      clubs: [{ id: "7i", label: "7-iron", carry_m: 150, notes: null }],
    };
    loadBagMock().mockReturnValue(imperialBag);

    render(
      <UnitsContext.Provider value={{ unit: "imperial", setUnit: () => {} }}>
        <MemoryRouter>
          <MyBagPage />
        </MemoryRouter>
      </UnitsContext.Provider>
    );

    const row = screen.getByDisplayValue("7-iron").closest("tr");
    expect(row).not.toBeNull();
    const carryInput = within(row as HTMLElement).getByPlaceholderText("—") as HTMLInputElement;

    expect(Number(carryInput.value)).toBeCloseTo(164, 1);

    fireEvent.change(carryInput, { target: { value: "180" } });

    const savedMeters = updateClubCarryMock().mock.calls[0][2];
    expect(savedMeters).toBeCloseTo(164.6, 1);
  });

  it("shows bag insights when gaps or overlaps are detected", async () => {
    const insightsBag: BagState = {
      updatedAt: Date.now(),
      clubs: [
        { id: "9i", label: "9i", carry_m: null, notes: null },
        { id: "8i", label: "8i", carry_m: null, notes: null },
        { id: "7i", label: "7i", carry_m: null, notes: null },
      ],
    };
    loadBagMock().mockReturnValue(insightsBag);
    fetchBagStatsMock.mockResolvedValue({
      "9i": { clubId: "9i", meanDistanceM: 120, sampleCount: 6 },
      "8i": { clubId: "8i", meanDistanceM: 152, sampleCount: 6 },
      "7i": { clubId: "7i", meanDistanceM: 157, sampleCount: 6 },
    });

    render(
      <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
        <MemoryRouter>
          <MyBagPage />
        </MemoryRouter>
      </UnitsContext.Provider>
    );

    await screen.findByText(/Bag insights/i);
    expect(
      screen.getByText(/Large distance gap between 9i and 8i \(32 m\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/8i and 7i carry almost the same distance \(5 m apart\)/i)
    ).toBeInTheDocument();
  });

  it("renders club status hints for auto data readiness", async () => {
    const statusBag: BagState = {
      updatedAt: Date.now(),
      clubs: [
        { id: "DR", label: "Driver", carry_m: null, notes: null },
        { id: "7i", label: "7-iron", carry_m: null, notes: null },
        { id: "GW", label: "Gap wedge", carry_m: null, notes: null },
      ],
    };
    loadBagMock().mockReturnValue(statusBag);
    fetchBagStatsMock.mockResolvedValue({
      DR: { clubId: "DR", meanDistanceM: 230, sampleCount: 7 },
      "7i": { clubId: "7i", meanDistanceM: 150, sampleCount: 2 },
    });

    render(
      <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
        <MemoryRouter>
          <MyBagPage />
        </MemoryRouter>
      </UnitsContext.Provider>
    );

    const loadedBag = loadBagMock().mock.results[0]?.value as BagState;
    expect(loadedBag.clubs.map((club) => club.id)).toEqual([
      "DR",
      "7i",
      "GW",
    ]);

    await waitFor(() => expect(fetchBagStatsMock).toHaveBeenCalled());
    const driverRow = screen.getByDisplayValue("Driver").closest("tr");
    expect(driverRow).not.toBeNull();
    await within(driverRow as HTMLElement).findByText(/Auto/i);
    expect(within(driverRow as HTMLElement).getByText(/230 m/i)).toBeInTheDocument();

    const sevenRow = screen.getAllByDisplayValue("7-iron")[0]?.closest("tr");
    expect(sevenRow).not.toBeNull();
    await within(sevenRow as HTMLElement).findByText(/Collect a few more shots to auto-calibrate/i);

    const gapWedgeRow = screen.getByDisplayValue("Gap wedge").closest("tr");
    expect(gapWedgeRow).not.toBeNull();
    await within(gapWedgeRow as HTMLElement).findByText(/No shot data yet/i);
  });
});
