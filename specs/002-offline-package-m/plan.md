# Implementation Plan: Offline Course Bundle for AR HUD

Status: Draft
Branch: 002-offline-package-m

## Goals
- Provide a downloadable course bundle for up to 9 holes for offline use.
- Include greens F/C/B, hazards, bbox, optional elevation, and cache metadata (ETag, TTL).
- Expose telemetry for latency and request counts.

## Scope
In-scope:
- Contract schema definition and example bundle.
- Mocked data source and simple JSON export.
- Single endpoint to retrieve bundle.
- Metrics exposure through existing /metrics.

Out-of-scope (v1):
- Plays-like calculations, green reading/putt line, live PostGIS.

## Milestones
1) Contract + Example
- Define OpenAPI/JSON schema for CourseBundle.
- Add a golden example file under specs/examples/.

2) Backend Endpoint
- Add route to fetch bundle by course id and hole range (max 9).
- Compute nearest hazards per hole (simple heuristic if needed).
- Add ETag and TTL headers.

3) Telemetry
- Histogram for latency and counter for requests.
- Label by course_id and status.

4) E2E (Mock)
- Seed mocked course data (9-hole minimal set).
- Add integration test to validate offline bundle contract.

5) Docs
- Update README and .env.example.

## Risks & Mitigations
- Large bundle size -> limit fields and compress if needed; document bounds.
- Ambiguous hazard distance -> add clarification or default rule (from tee) with explicit label.
- Missing elevation -> mark per-hole presence explicitly.

## Rollout
- Feature flagged endpoint if needed.
- Measure P95. Iterate on data size.

## Success Criteria
- P95 < 300 ms on mocked data.
- E2E test green.
- Metrics visible and labeled correctly.
