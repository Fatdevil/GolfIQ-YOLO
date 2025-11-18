import { useEffect, useMemo, useState } from "react";
import { fetchBundleIndex, getHoleHud } from "@/api";
import type { BundleIndexItem, HoleHud, HudQuery } from "@/api";

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function HudPreviewPage() {
  const [courses, setCourses] = useState<BundleIndexItem[]>([]);
  const [memberId, setMemberId] = useState<string>("preview-member");
  const [runId, setRunId] = useState<string>("preview-run");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [hole, setHole] = useState<number>(1);
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [hud, setHud] = useState<HoleHud | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBundleIndex()
      .then((data) => setCourses(data))
      .catch((err) => setError(err?.message ?? "Failed to load courses"));
  }, []);

  const courseOptions = useMemo(
    () =>
      courses.map((course) => (
        <option key={course.courseId} value={course.courseId}>
          {course.name} ({course.holes} holes)
        </option>
      )),
    [courses],
  );

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    setHud(null);

    const query: HudQuery = {
      memberId,
      runId,
      hole,
      courseId: selectedCourseId || undefined,
      lat: parseNumber(lat),
      lon: parseNumber(lon),
    };

    try {
      const response = await getHoleHud(query);
      setHud(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch HUD";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Watch HUD Preview</h1>
        <p className="text-sm text-slate-300">
          Select a hero course, pick a hole, and simulate GNSS to view the watch HUD
          payload.
        </p>
      </div>

      <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-900 p-4 shadow">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="memberId">
            Member ID
            <input
              id="memberId"
              type="text"
              className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="runId">
            Run ID
            <input
              id="runId"
              type="text"
              className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="course">
          Course
          <select
            id="course"
            className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            <option value="">Select a course</option>
            {courseOptions}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="hole">
          Hole number
          <input
            id="hole"
            type="number"
            min={1}
            className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
            value={hole}
            onChange={(e) => setHole(Number(e.target.value) || 1)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="lat">
            Latitude
            <input
              id="lat"
              type="text"
              inputMode="decimal"
              placeholder="56.4101"
              className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="lon">
            Longitude
            <input
              id="lon"
              type="text"
              inputMode="decimal"
              placeholder="-2.7899"
              className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="inline-flex w-full justify-center rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900"
          onClick={handlePreview}
          disabled={loading}
        >
          {loading ? "Loading..." : "Preview HUD"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">HUD JSON</h2>
        <div className="min-h-[160px] rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-100">
          {hud ? <pre>{JSON.stringify(hud, null, 2)}</pre> : <p>No HUD loaded yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default HudPreviewPage;
