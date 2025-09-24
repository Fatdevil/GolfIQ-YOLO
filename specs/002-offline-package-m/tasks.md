# Tasks: Offline Course Bundle for AR HUD

- [ ] Schema: Define CourseBundle JSON schema (holes, F/C/B, hazards, bbox, elevation?, metadata)
- [ ] Example: Add golden example bundle under specs/examples/course-bundle.min.json
- [ ] Server: Add GET /course/{id}/bundle?range=1-9 (or similar) with ETag + TTL
- [ ] Data: Seed mock course data for 9 holes
- [ ] Hazards: Provide nearest hazard per hole (document rule)
- [ ] Telemetry: Add latency histogram + request counter with labels
- [ ] Tests: Unit + integration test validating contract and caching headers
- [ ] Docs: README + .env.example updates
- [ ] SLO: Measure P95 in CI or local harness and document
