# Course Importer

The course importer CLI converts raw mapping data (GeoJSON or Overpass/OSM
exports) into the GolfIQ bundle layout consumed by the FastAPI service.  It can
be run locally or in CI and is intentionally dependency-light so it works in
pure Python environments.

## Usage

```bash
python tools/course_import.py \
  --source geojson \
  --in exports/pebble_creek.geojson \
  --course-id pebble-creek \
  --course-name "Pebble Creek" \
  --tee tee \
  --green green \
  --hazards bunker,water
```

Arguments:

| Flag | Description |
| --- | --- |
| `--source {geojson\|osm}` | Input format selector. OSM expects an Overpass JSON export. |
| `--in` | Path to the raw input file. |
| `--course-id` | Slug used for the output folder under `data/courses/`. |
| `--course-name` | Optional friendly name stored in metadata. |
| `--tee`, `--green`, `--hazards` | Comma-separated `properties.kind` values that should map to tees, greens and hazards. Defaults apply when omitted. |
| `--output-dir` | Override the output root (default: repo `data/courses/`). |
| `--hole-property` | Custom property containing the hole number (default: `hole`). |

The command produces `data/courses/{course_id}/hole_{n}.geojson` files and a
`metadata.json` summary containing the course id, optional name, updated
timestamp, hole feature counts and tee coordinates.

## Mapping Rules

* Hole number is discovered via `properties[hole_property]` (default `hole`).
* Feature categories are derived from `properties.kind` (fallback keys:
  `feature`, `category`, `type`).
* Pins are preserved when `kind == "pin"`.
* When no explicit mappings are supplied:
  * `tee` kinds are interpreted as tees.
  * `green*` kinds are treated as greens.
  * `bunker`, `water`, or `hazard` kinds are stored as hazards.
* Coordinates are normalised to 6 decimal places and polygons have duplicate
  points removed with closing rings enforced.
* Metadata captures tee coordinates per hole (if any) and caches a single
  `updatedAt` timestamp in UTC.

### OSM specifics

* Only OSM elements containing golf-related tags are considered. Nodes become
  pins/tees, while ways/relations with inline geometry are exported as polygons.
* The hole number is derived from `tags.ref`, `tags.hole`, or `tags["golf:hole"]`.

## Optional PostGIS Sync

If `DATABASE_URL` is present the importer attempts to upsert bundle rows into a
`course_bundles` table (JSON payload + metadata).  The write is skipped with a
warning when `psycopg` is unavailable.

## Service Integration

`server/courses/service.py` now surfaces helper methods:

* `list_courses()` enumerates bundles on disk (or via PostGIS in future) and
  returns `id`, `name`, `updatedAt`, `etag`, and `holeCount`.
* `list_holes(course_id)` returns a summary of holes with feature counts.

The FastAPI router exposes:

* `GET /courses` → bundled course list with ETag metadata.
* `GET /course/{id}` → GeoJSON FeatureCollection (unchanged path, now including
  `updatedAt` in the payload properties).
* `GET /course/{id}/holes` → hole summaries + bundle ETag/updatedAt.

## QA Checklist

1. Run `python tools/course_import.py` against a representative GeoJSON export.
2. Inspect generated `metadata.json` for accurate `updatedAt`, hole counts, and
   tee coordinates.
3. Open `hole_{n}.geojson` files in a GeoJSON viewer to confirm geometry
   simplification and attributes.
4. If a PostGIS database is configured, verify rows in `course_bundles` are
   updated after a rerun.
5. Execute `pytest server/tests/test_course_importer.py` to ensure the CLI happy
   path remains green.
