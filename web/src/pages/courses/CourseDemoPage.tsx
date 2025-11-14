import { useMemo, useState } from "react";

import { useCourseBundle, useCourseIds } from "../../courses/hooks";
import type { GeoPoint } from "../../courses/types";

function formatPoint(point?: GeoPoint): string {
  if (!point) {
    return "–";
  }
  const lat = point.lat.toFixed(4);
  const lon = point.lon.toFixed(4);
  return `${lat}, ${lon}`;
}

export default function CourseDemoPage() {
  const {
    data: courseIds,
    loading: idsLoading,
    error: idsError,
  } = useCourseIds();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const {
    data: bundle,
    loading: bundleLoading,
    error: bundleError,
  } = useCourseBundle(selectedId);

  const options = useMemo(() => courseIds ?? [], [courseIds]);

  return (
    <div className="course-demo-page">
      <h1>Course Bundles (Demo)</h1>
      {idsLoading && <p>Loading demo courses…</p>}
      {idsError && !idsLoading && (
        <p role="alert">Failed to load course list: {idsError.message}</p>
      )}
      {!idsLoading && !idsError && (
        <label style={{ display: "block", margin: "1rem 0" }}>
          Course (demo bundle)
          <select
            value={selectedId ?? ""}
            onChange={(event) =>
              setSelectedId(event.target.value ? event.target.value : undefined)
            }
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="">Select a course…</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedId && (
        <section>
          {bundleLoading && <p>Loading course info…</p>}
          {bundleError && !bundle && (
            <p role="alert">Failed to load course bundle: {bundleError.message}</p>
          )}
          {bundle && (
            <div>
              <h2>
                {bundle.name} ({bundle.country})
              </h2>
              <p>{bundle.holes.length} holes loaded</p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Hole</th>
                      <th>Par</th>
                      <th>Front</th>
                      <th>Middle</th>
                      <th>Back</th>
                      <th>Hazards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.holes.map((hole) => (
                      <tr key={hole.number}>
                        <td>{hole.number}</td>
                        <td>{hole.par}</td>
                        <td>{formatPoint(hole.green?.front)}</td>
                        <td>{formatPoint(hole.green?.middle)}</td>
                        <td>{formatPoint(hole.green?.back)}</td>
                        <td>{hole.hazards?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
