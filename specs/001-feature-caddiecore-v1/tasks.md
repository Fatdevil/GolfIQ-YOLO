# Tasks: CaddieCore v1 (dispersion -> klubbrek + explain-score)

**Input**: Design documents from `specs/001-feature-caddiecore-v1/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   -> If not found: ERROR "No implementation plan found"
   -> Extract: tech stack, libraries, structure
2. Load optional design documents:
   -> research.md: Extract decisions -> setup tasks
   -> data-model.md: Extract entities -> model tasks
   -> contracts/: Each file -> contract test task
   -> quickstart.md: Extract scenarios -> integration tests
3. Generate tasks by category:
   - Setup: project init, dependencies, linting
   - Tests: contract tests, integration tests
   - Core: models, services, CLI commands
   - Integration: DB, middleware, logging
   - Observability: `/health` endpoint, Prometheus metrics, build info, KPI telemetry
   - Polish: unit tests, performance, docs
4. Apply task rules:
   -> Different files = mark [P] for parallel
   -> Same file = sequential (no [P])
   -> Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   -> All contracts have tests?
   -> All entities have models?
   -> All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- Backend service lives under `server/`
- Tests live under `server/tests/`
- Specs + fixtures live under `specs/001-feature-caddiecore-v1/` and `tests/`

## Phase 3.1: Setup
- [ ] T001 Scaffold `server/services/caddie_core/` package (create `__init__.py`, `models.py`, `engine.py`, `explain.py`, `telemetry.py`, `service.py`) and export module in `server/services/__init__.py`.
- [ ] T002 Update dependencies for gaussian math + telemetry tooling (`pyproject.toml`, `server/requirements.txt`, `requirements-dev.txt`) to include NumPy/SciPy, pytest plugins, prometheus-client.
- [ ] T003 Add demo fixture `tests/fixtures/caddie_core/demo_shots.json` and helper script `scripts/seed_caddie_demo.py` per quickstart seeding flow.

## Phase 3.2: Tests First (TDD) – MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T004 [P] Contract test `server/tests/test_caddie_contract.py` validating POST `/caddie/recommend` happy path + 422 error envelope.
- [ ] T005 [P] Unit tests `server/tests/test_caddie_engine.py` for dispersion aggregation, wind/elevation adjustments, and club selection edge cases.
- [ ] T006 [P] Unit tests `server/tests/test_caddie_explain.py` for explain-score ranking, direction flags, zero-sum handling.
- [ ] T007 [P] Unit tests `server/tests/test_caddie_telemetry.py` covering Prometheus metrics emission and build-info logging payload.
- [ ] T008 [P] Unit tests `server/tests/test_caddie_models.py` (new) asserting Pydantic validation for PlayerProfile, ShotSample, TargetContext, Recommendation payload/response schemas.
- [ ] T009 [P] Integration test `server/tests/test_caddie_integration_range.py` (User Story 1/2/4) ensuring range scenario returns club, explain factors, P50/P80.
- [ ] T010 [P] Integration test `server/tests/test_caddie_integration_on_course.py` (User Story 3) validating hazard margin + conservative club output.
- [ ] T011 [P] Integration test `server/tests/test_caddie_integration_low_confidence.py` (User Story 5) simulating sparse data to assert low confidence + defensive recommendation.

## Phase 3.3: Core Implementation (ONLY after tests are red)
- [ ] T012 Implement `PlayerProfile` model in `server/services/caddie_core/models.py` (club list validation, optional metadata).
- [ ] T013 Implement `ShotSample` model in `server/services/caddie_core/models.py` (per-club validation, timestamp normalization).
- [ ] T014 Implement `ShotAggregate` helper in `server/services/caddie_core/models.py` (count thresholds, confidence helper).
- [ ] T015 Implement `TargetContext` model in `server/services/caddie_core/models.py` (wind/elevation ranges, hazard optionality).
- [ ] T016 Implement `Recommendation` + `ExplainFactor` models in `server/services/caddie_core/models.py` (confidence enum, weight invariants).
- [ ] T017 Implement payload/response wrappers (`RecommendationPayload`, `RecommendationResponse`, `ErrorEnvelope`) in `server/services/caddie_core/models.py`.
- [ ] T018 Implement gaussian aggregation, wind/elevation helpers, confidence logic in `server/services/caddie_core/engine.py`.
- [ ] T019 Implement explain-score module `server/services/caddie_core/explain.py` returning sorted top-3 factors with normalized weights.
- [ ] T020 Implement telemetry utilities in `server/services/caddie_core/telemetry.py` (histogram/counter observers, structured log builder).
- [ ] T021 Implement orchestration service `server/services/caddie_core/service.py` combining aggregates, explain, telemetry, and returning DTOs.
- [ ] T022 Implement FastAPI schema adapters in `server/schemas/caddie_recommend.py` mapping request/response to domain models.
- [ ] T023 Implement POST `/caddie/recommend` route in `server/routes/caddie_recommend.py` wiring service + telemetry and HTTP error handling.

## Phase 3.4: Integration & Observability
- [ ] T024 Register CaddieCore router in `server/app.py` and ensure dependency injection / startup wiring.
- [ ] T025 Update `/health` endpoint in `server/api/health.py` to report CaddieCore readiness, build version, git SHA.
- [ ] T026 Extend metrics registry in `server/metrics/__init__.py` (or equivalent) to expose `caddie_recommend_latency_ms`, `caddie_recommend_requests_total`, and `caddie_recommend_factors_count`.
- [ ] T027 Ensure logging/telemetry pipeline captures explain factors (e.g., update `server/logging.py` or tracking config).
- [ ] T028 Document seeding script + workflow references in `README.md` scaffolding section.

## Phase 3.5: Polish & Compliance
- [ ] T029 [P] Run full test suite with coverage (`pytest --cov=server --cov-report=term`) and capture backend >=70% evidence in `STATUS.md` (or plan.md progress log).
- [ ] T030 Build performance harness `tests/perf/profile_caddie_recommend.py` and record P95 <50 ms results linked in quickstart.
- [ ] T031 [P] Update documentation (`README.md`, `docs/api/caddie_core.md` or new file, `specs/001-feature-caddiecore-v1/quickstart.md`) with formulas, inputs, curl examples, telemetry metrics.
- [ ] T032 [P] Refresh `.env.example` with CaddieCore-specific toggles (e.g., `CADDIE_METRICS_SAMPLE_RATE`, scenario flags) and describe usage in docs.
- [ ] T033 Execute quickstart checklist end-to-end (seed, range + on-course curl, metrics check) and record outcomes in `specs/001-feature-caddiecore-v1/plan.md` progress tracker.
- [ ] T034 Final refactor/duplication pass across `server/services/caddie_core/*`, rerun tests, ensure mypy/docstrings quality.

## Dependencies
- Setup tasks (T001-T003) must finish before any tests.
- Tests (T004-T011) must be authored and failing before starting implementation tasks (T012-T023).
- Model tasks (T012-T017) feed engine/explain (T018-T019); they in turn feed service (T021) and route (T023).
- Observability tasks (T024-T028) rely on successful route + telemetry implementation.
- Polish tasks (T029-T034) execute only after integration tasks complete.

## Parallel Example
```
/specify run-task T004
/specify run-task T005
/specify run-task T006
/specify run-task T007
/specify run-task T008
/specify run-task T009
/specify run-task T010
/specify run-task T011
```
*(Run this batch in parallel after setup to establish failing tests across contract, unit, and integration suites.)*

## Notes
- Maintain strict TDD: write tests first, confirm they fail, then implement.
- Use coefficients & heuristics captured in `specs/001-feature-caddiecore-v1/research.md` for engine/explain logic.
- Keep telemetry PII-free and align with constitution observability mandates.
- Document deviations or unresolved items in plan.md Complexity/Progress sections.
