# Course bundle pipeline

This document outlines how raw geodata is transformed into binary-safe course bundles that feed `/bundle/index` and `/bundle/course/{id}`.

## Overview

1. Gather raw source data (GeoJSON, simple JSON, or KML exports) in `data/sources/` (ignored from git).
2. Run the generator CLI to simplify, quantise, and filter features.
3. Review the generated bundle(s) under `data/courses/` and metadata in `data/courses/meta/`.
4. Validate the bundles and run the focused FastAPI tests.

The resulting JSON bundles are referenced by the server routes and can be cached offline by mobile clients using the TTL + ETag headers.

## Generator CLI

```
python scripts/gen_course_bundle.py \
  --in "data/sources/*.geojson" \
  --out data/courses \
  --kind-map data/sources/kind_map.json \
  --simplify-m 0.8 \
  --quant 1e-6 \
  --limit 50
```

### Inputs

* **`--in`**: Glob pointing at raw files. GeoJSON feature collections or simple JSON objects with a `features` array are supported. KML files will be skipped with a warning.
* **`--kind-map`** *(optional)*: A JSON object mapping source property values to canonical bundle types. Example:

  ```json
  {
    "PuttingSurface": "green",
    "Sand": "bunker",
    "Rough": "hazard"
  }
  ```

  The generator inspects `properties.kind`, `properties.type`, `properties.feature`, and `properties.feature_type` to classify each feature.

* **`--simplify-m`**: Ramer–Douglas–Peucker tolerance in metres. Coordinates are projected locally before simplification.
* **`--quant`**: Coordinate quantum (defaults to `1e-6`, ≈0.11 m). Values are rounded using decimal quantisation for stable ETags.
* **`--limit`**: Process at most *N* files from the glob.

Unsupported feature types are skipped with a log entry. Only `Polygon`, `MultiPolygon`, and `LineString` geometries are emitted.

### Processing steps

1. **Simplification** – rings and lines are simplified using a pure-Python RDP implementation (`scripts/_rdp.py`) with RDP tolerance expressed in metres (via `_geo.to_planar`).
2. **Quantisation** – coordinates are rounded to the configured quantum for determinism (`scripts/_geo.py`).
3. **Filtering** – polygons smaller than 1 m² and lines shorter than 2 m are dropped.
4. **Canonicalisation** – feature IDs fall back to type-index (e.g. `g1`), and features are sorted by `(type, id)` before writing.
5. **Metadata** – a companion `data/courses/meta/{id}.json` file captures bbox, updatedAt, feature counts, and approximate aggregated areas.

Generated bundles follow this envelope:

```json
{
  "courseId": "demo_sunrise",
  "version": 1,
  "ttlSec": 86400,
  "features": [
    {
      "id": "g1",
      "type": "green",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "green": {
        "sections": ["front", "middle", "back"],
        "fatSide": "L",
        "pin": { "lat": 37.7752, "lon": -122.4192, "ts": "2025-03-01T10:30:00Z" }
      }
    }
  ]
}
```

When present, the optional `green` object captures approach metadata for that putting surface. `sections`
lists the valid pin slices (front/middle/back) in tee-to-green order, while `fatSide` indicates the safer
side (`"L"` for left, `"R"` for right) used to bias aim selection when hazards guard the thin side. The
optional `pin` object stores the last-surveyed hole location (latitude/longitude in decimal degrees plus an
ISO-8601 timestamp). Mobile clients cache this metadata via `greensById` and expose it to the caddie planner
and HUD. The HUD respects remote configuration keys `rc.green.sections.enabled` and
`rc.green.pinDrop.enabled`; when either is disabled—or when tournament-safe mode is active—the pin tools
and fat-side/section hints are hidden automatically.

Metadata files look like:

```json
{
  "courseId": "demo_sunrise",
  "name": "Demo Sunrise",
  "bbox": [-122.4014, 37.7879, -122.4005, 37.78905],
  "updatedAt": "2025-02-01T00:00:00Z",
  "featureCount": 4,
  "areaSqM": 12500.0,
  "approx": {"greens": 1, "fairways": 1, "bunkers": 1, "cartpaths": 1}
}
```

## Validation

```
python scripts/validate_course_bundle.py data/courses/*.json --max-kb 200
```

The validator enforces schema shape, geometry types, coordinate lengths (Polygon rings ≥4 points), and size ceilings. Exit status is non-zero when any file fails.

## Testing the server endpoints

Run the focused pytest targets to exercise both `/bundle/course/{id}` and the new index:

```
pytest server/tests/test_bundle_route.py server/tests/test_bundle_index.py tests/scripts -q
```

After the FastAPI app is running locally, validate the responses:

* `GET /bundle/index` – lists available bundles with `bbox`, `updatedAt`, and `approx` counts. ETag is a SHA-256 of the payload and cache-control is `public, max-age=600`.
* `GET /bundle/course/demo_sunrise` – serves the bundle contract with `ttlSec` sourced from configuration. ETags/Cache-Control mirror the existing implementation.

In QA builds the AR HUD offers a long-press gesture on the course mini-map to drop a manual pin using the
current GPS fix. The gesture is gated by `rc.green.pinDrop.enabled` and suppressed automatically when
`hud.tournamentSafe` (or the legacy `tournamentSafe`) is enabled.

## Size targets and caching

* Maximum bundle size: 200 kB (enforced in CI and the validator CLI).
* TTL (`ttlSec`): default 24h in generated files; the HTTP layer overrides with remote configuration.
* ETag: computed by the API from canonical JSON to ensure offline caches remain stable across deployments.

Mobile clients fetch bundles opportunistically and cache them offline using TTL + ETag validation. When the TTL expires, the client re-validates using `If-None-Match` to avoid re-downloading unchanged bundles.

## Licensing notes

If OpenStreetMap (OSM) or other ODbL/CC-BY-SA sources are used upstream, ensure attribution obligations are met in-product and in any exported metadata. Only derived, simplified JSON bundles are committed to the repository.

## Generating production bundles

1. Place your raw datasets in `data/sources/` (untracked).
2. Run the generator with `--limit 50` to batch convert.
3. Review metadata files to populate optional names or additional counters.
4. Run the validator + targeted tests.
5. Start the dev server and confirm `/bundle/index` and `/bundle/course/{id}` respond as expected.
6. Mobile QA: load 2–3 courses in AR HUD QA-mode and verify offline rendering.

## Batch to 50+

When scaling beyond a handful of courses, switch to the manifest-driven generator flow. Create `data/sources/manifest.json` with entries describing each bundle:

```json
[
  {
    "id": "sunset_links",
    "source": "data/sources/sunset_links.geojson",
    "name": "Sunset Links"
  },
  {
    "id": "copper_creek",
    "source": "data/sources/copper_creek.geojson",
    "name": "Copper Creek"
  }
]
```

The generator accepts the manifest via `--manifest` and can slice work into predictable batches. Example commands:

```bash
python scripts/gen_course_bundle.py \
  --manifest data/sources/manifest.json \
  --out data/courses \
  --simplify-m 0.8 \
  --quant 1e-6 \
  --batch 0:10

# Next 10 entries
python scripts/gen_course_bundle.py \
  --manifest data/sources/manifest.json \
  --out data/courses \
  --simplify-m 0.8 \
  --quant 1e-6 \
  --batch 10:10
```

`--batch` accepts `start:count`, `index/total` (e.g. `2/5`), or a simple count (`--batch 10` processes the first ten manifest rows). Each run prints a table summarising course IDs, feature counts, and bundle sizes so the full batch can be inspected quickly.

## In-app search

The QA AR HUD overlay now includes a search bar that filters the bundle index in real-time. Results surface fuzzy name matches (prefix + typo tolerance) and, when a location fix is available, nearby courses float to the top. Selecting a suggestion instantly loads the corresponding bundle using the same cache-aware client as the manual picker.
