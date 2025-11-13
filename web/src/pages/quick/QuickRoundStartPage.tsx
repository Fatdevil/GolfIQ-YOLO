import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  createRoundId,
  loadAllRounds,
  saveRound,
  QuickRoundSummary,
} from "../../features/quickround/storage";
import { QuickRound } from "../../features/quickround/types";

export default function QuickRoundStartPage() {
  const navigate = useNavigate();
  const [courseName, setCourseName] = useState("");
  const [teesName, setTeesName] = useState("");
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [showPutts, setShowPutts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<QuickRoundSummary[]>([]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("sv-SE", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    []
  );

  useEffect(() => {
    const summaries = loadAllRounds().sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    setRounds(summaries);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCourseName = courseName.trim();
    if (!trimmedCourseName) {
      setError("Ange ett ban-namn");
      return;
    }
    const trimmedTeesName = teesName.trim();
    const holes: QuickRound["holes"] = Array.from({ length: holesCount }, (_, index) => ({
      index: index + 1,
      par: 4,
    }));
    const round: QuickRound = {
      id: createRoundId(),
      courseName: trimmedCourseName,
      teesName: trimmedTeesName || undefined,
      holes,
      startedAt: new Date().toISOString(),
      showPutts,
    };
    saveRound(round);
    navigate(`/play/${round.id}`);
  };

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-100">Spela runda</h1>
        <p className="mt-2 text-sm text-slate-400">
          Starta en snabb solo-runda utan eventkod. Dina resultat sparas lokalt på den här enheten.
        </p>
        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="courseName">
              Bana
            </label>
            <input
              id="courseName"
              type="text"
              value={courseName}
              onChange={(event) => {
                setCourseName(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="Ex: Bro Hof Slottsbana"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="teesName">
              Tee (valfritt)
            </label>
            <input
              id="teesName"
              type="text"
              value={teesName}
              onChange={(event) => setTeesName(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="Ex: Gul"
            />
          </div>
          <div className="space-y-3">
            <span className="block text-sm font-medium text-slate-200">Antal hål</span>
            <div className="flex gap-4">
              {[9, 18].map((count) => (
                <label key={count} className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="holesCount"
                    value={count}
                    checked={holesCount === count}
                    onChange={() => setHolesCount(count as 9 | 18)}
                    className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  {count} hål
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={showPutts}
              onChange={(event) => setShowPutts(event.target.checked)}
              className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            Visa puttar
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Starta runda
          </button>
        </form>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Tidigare rundor</h2>
        {rounds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Du har inga sparade snabbrundor ännu.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rounds.map((round) => (
              <li key={round.id} className="rounded border border-slate-800 bg-slate-950/40 p-4">
                <Link to={`/play/${round.id}`} className="flex flex-col gap-1 text-sm text-slate-200">
                  <span className="text-base font-semibold text-slate-100">{round.courseName}</span>
                  <span className="text-xs text-slate-400">
                    Startad {dateFormatter.format(new Date(round.startedAt))}
                  </span>
                  <span className="text-xs font-semibold text-emerald-300">
                    {round.completedAt ? "Klar" : "Pågår"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
