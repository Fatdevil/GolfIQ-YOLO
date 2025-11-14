import React from "react";
import { loadBag, updateClubCarry, upsertClub } from "@web/bag/storage";
import type { BagState, BagClub } from "@web/bag/types";

function formatTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export default function MyBagPage(): JSX.Element {
  const [bag, setBag] = React.useState<BagState>(() => loadBag());
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newClub, setNewClub] = React.useState<{ id: string; label: string }>({
    id: "",
    label: "",
  });

  const handleCarryChange = React.useCallback((club: BagClub, value: string) => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) {
      return;
    }
    setBag((prev) => updateClubCarry(prev, club.id, parsed));
  }, []);

  const handleLabelChange = React.useCallback((club: BagClub, value: string) => {
    setBag((prev) => upsertClub(prev, { id: club.id, label: value }));
  }, []);

  const handleNotesChange = React.useCallback((club: BagClub, value: string) => {
    const notes = value.trim();
    setBag((prev) => upsertClub(prev, { id: club.id, notes: notes.length > 0 ? notes : null }));
  }, []);

  const handleAddClub = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const id = newClub.id.trim();
      const label = newClub.label.trim();
      if (!id || !label) {
        return;
      }
      setBag((prev) => upsertClub(prev, { id, label, carry_m: null }));
      setNewClub({ id: "", label: "" });
      setShowAddForm(false);
    },
    [newClub]
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Min bag</h1>
        <p className="text-sm text-slate-400">
          Senast uppdaterad: {formatTimestamp(bag.updatedAt)}
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Klubb</th>
                <th className="px-4 py-3 font-medium">Id</th>
                <th className="px-4 py-3 font-medium">Carry (m)</th>
                <th className="px-4 py-3 font-medium">Anteckningar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {bag.clubs.map((club) => (
                <tr key={club.id}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={club.label}
                      onChange={(event) => handleLabelChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs uppercase tracking-wide text-slate-400">
                      {club.id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={club.carry_m ?? ""}
                      onChange={(event) => handleCarryChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={club.notes ?? ""}
                      onChange={(event) => handleNotesChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      placeholder="Valfritt"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="mb-3">
          Dessa längder används av GolfIQs caddie och gapping. Du kan uppdatera dem manuellt eller från rangen.
        </p>
        <button
          type="button"
          onClick={() => setShowAddForm((value) => !value)}
          className="rounded border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/10"
        >
          {showAddForm ? "Avbryt" : "Lägg till klubb"}
        </button>
        {showAddForm && (
          <form onSubmit={handleAddClub} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-300">
              Id
              <input
                type="text"
                value={newClub.id}
                onChange={(event) =>
                  setNewClub((prev) => ({ ...prev, id: event.target.value.toUpperCase() }))
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                placeholder="t.ex. 4H"
                required
              />
            </label>
            <label className="flex flex-[2] flex-col gap-1 text-xs text-slate-300">
              Namn
              <input
                type="text"
                value={newClub.label}
                onChange={(event) => setNewClub((prev) => ({ ...prev, label: event.target.value }))}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                placeholder="t.ex. Hybrid 4"
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Spara
              </button>
            </div>
          </form>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Kör gapping på rangen för att uppdatera längder automatiskt.
        </p>
      </div>
    </div>
  );
}
