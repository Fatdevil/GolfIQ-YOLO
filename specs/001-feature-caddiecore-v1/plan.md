# Implementation Plan: CaddieCore v1 (dispersion -> klubbrek + explain-score)

**Branch**: `001-feature-caddiecore-v1` | **Date**: 2025-09-23 | **Spec**: specs/001-feature-caddiecore-v1/spec.md
**Input**: Feature specification from `/specs/001-feature-caddiecore-v1/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   -> If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   -> Detect Project Type from context (web=frontend+backend, mobile=app+api)
   -> Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   -> If violations exist: Document in Complexity Tracking
   -> If no justification possible: ERROR "Simplify approach first"
   -> Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 -> research.md
   -> If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 -> contracts, data-model.md, quickstart.md, agent-specific template file
7. Re-evaluate Constitution Check section
   -> If new violations: Refactor design, return to Phase 1
   -> Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 -> Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Deliver a CaddieCore recommendation engine that lives in `server/services/caddie_core/` and powers POST `/caddie/recommend`. The service consumes player dispersion history and target context, returns a recommended club plus conservative fallback, exposes explain-score factors, and logs telemetry while meeting constitution quality, performance (<50 ms P95), security, and observability gates.

## Technical Context
**Language/Version**: Python 3.11 (FastAPI backend)  
**Primary Dependencies**: FastAPI, Pydantic, NumPy/SciPy for gaussian stats, internal telemetry/logging utilities  
**Storage**: In-memory/mock shot samples sourced from JSON/CSV fixtures (no persistent DB in v1)  
**Testing**: pytest with coverage measurement; integration tests via FastAPI TestClient; contract tests using Pydantic schema validation  
**Target Platform**: Backend service on Linux containers; clients are iOS/Android apps consuming the API  
**Project Type**: Single backend service with API endpoints  
**Performance Goals**: POST `/caddie/recommend` P95 <50 ms with mock data; inference budget <=25 ms  
**Constraints**: Must keep backend coverage >=70%, enforce lint/format in CI, zero HIGH bandit/pip-audit, observability endpoints intact  
**Scale/Scope**: v1 pilot for single player dataset (~200 shots) while ready for extension to more players later

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Test & Quality Gates**: Plan introduces unit tests for dispersion math, endpoint contract tests, and integration flows to sustain backend coverage >=70% and adds e2e range/on-course scenarios before merge.
- **Performance & UX**: Architecture budgets <=25 ms for inference, retains low-latency FastAPI patterns, and documents telemetry to ensure <50 ms P95; mobile UX consumers get deterministic payload shape for quick rendering.
- **Security & Compliance**: Request/response schemas exclude PII beyond player ids, secrets stay in env vars, and release checklist includes bandit/pip-audit with zero HIGH results.
- **Observability**: Adds structured logs + Prometheus metrics for recommendation latency and factor usage; `/health` updated to confirm caddie_core wiring.
- **Spec-Driven Delivery**: Feature ran through `/specify` and this `/plan`; `/plan` records migrations/rollback expectations and will seed `/tasks`.

**Initial Constitution Check**: PASS (requirements are captured; no deviations needed).

## Project Structure

### Documentation (this feature)
```
specs/001-feature-caddiecore-v1/
|-- plan.md            # This file
|-- research.md        # Phase 0 decisions & open questions
|-- data-model.md      # Phase 1 entity definitions
|-- quickstart.md      # Phase 1 manual & automated validation steps
`-- contracts/         # Phase 1 API schema (OpenAPI + examples)
```

### Source Code (repository root)
```
server/
|-- services/
|   |-- __init__.py
|   `-- caddie_core/
|       |-- __init__.py
|       |-- models.py         # domain dataclasses/pydantic models
|       |-- engine.py         # gaussian dispersion calculations
|       |-- explain.py        # factor weighting & normalization
|       `-- telemetry.py      # helpers for logging/metrics hooks
|-- routes/
|   `-- caddie_recommend.py   # POST /caddie/recommend wiring
|-- schemas/
|   `-- caddie_recommend.py   # request/response schemas reused in tests
`-- tests/
    |-- contract/test_caddie_recommend.py
    |-- integration/test_caddie_recommend_range.py
    |-- integration/test_caddie_recommend_on_course.py
    `-- unit/caddie_core/
        |-- test_engine.py
        `-- test_explain.py
```

**Structure Decision**: Option 1 (single project). The backend already follows a monorepo layout; we extend the FastAPI service with a dedicated `caddie_core` module and accompanying tests.

## Phase 0: Outline & Research
1. Identify unknowns:
   - Calibrate gaussian dispersion constants (`k_sigma`, hazard buffer) per dataset size.
   - Determine minimum shot sample size heuristics for uncertainty categories.
   - Decide on wind/elevation adjustment formulas compatible with v1 scope.
   - Define telemetry metrics (names, labels) aligning with existing Prometheus setup.
2. Research tasks executed (see `research.md`):
   - Summarized domain math choices and references for dispersion modeling.
   - Documented fallback strategies when data volume is low or hazard distance missing.
   - Chose normalization approach for explain-score weights.
3. Outcomes recorded with decision/rationale/alternatives; no open NEEDS CLARIFICATION remain for development.

**Phase 0 Output**: `research.md` (completed).

## Phase 1: Design & Contracts
1. Data modeling (`data-model.md`):
   - Documented `PlayerProfile`, `ShotSample`, `ShotAggregate`, `TargetContext`, `Recommendation`, and `ExplainFactor` including validation rules and computed fields.
2. API contract (`contracts/caddie_recommend.yaml` + examples):
   - OpenAPI 3.1 snippet defining request/response schemas, status codes, and error structure.
   - JSON examples for happy path, hazard-conservative response, and low-confidence scenario.
3. Quickstart (`quickstart.md`):
   - Step-by-step instructions to run FastAPI locally with mock data, execute range/on-course scenarios, verify Prometheus metrics, and check logs for explain-score.
4. Tests planned:
   - Contract test ensures schema compliance and Pydantic validation failure for malformed payload.
   - Unit tests cover gaussian engine, explain-score weighting, safety margin logic, and telemetry emission hooks.
   - Integration tests simulate range vs on-course with hazard to validate fallback behaviour.
5. Agent context (skipped for now; repo lacks Codex agent file). If required later, follow instructions with update script.

**Phase 1 Output**: `data-model.md`, `contracts/caddie_recommend.yaml`, `contracts/examples/*.json`, `quickstart.md` (completed).

## Phase 2: Task Planning Approach
*This section prepares /tasks (do not create tasks.md here).* 

**Task Generation Strategy**:
- Use `.specify/templates/tasks-template.md` as baseline.
- Create setup tasks for module scaffolding and wiring in FastAPI + telemetry.
- Tests-first: contract test, gaussian engine unit tests, explain-score unit tests, integration scenarios (range + on-course).
- Core implementation tasks per file: domain models, engine logic, explain scoring, service orchestrator, API route, telemetry instrumentation.
- Observability tasks: expose metrics, log factors, ensure `/health` includes readiness.
- Polish tasks: performance profiling for <50 ms, coverage verification, documentation updates, bandit/pip-audit run.

**Ordering Strategy**:
1. Setup repo scaffolding.
2. Author contract + tests before engine implementations.
3. Build data aggregation helpers before inference engine.
4. Implement engine -> explain -> service orchestrator -> API route.
5. Wire telemetry & metrics.
6. Run polish/performance/security validation.

**Estimated Output**: 28-32 tasks with [P] markers for independent files (e.g., multiple unit tests, doc updates).

## Phase 3+: Future Implementation
- **Phase 3**: Execute `/tasks` output to create tasks.md.
- **Phase 4**: Implement code following tasks order.
- **Phase 5**: Validate via automated tests, quickstart script, performance check (<50 ms), observability dashboards.

## Complexity Tracking
No deviations required; solution fits within existing FastAPI service architecture.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| (none)    | -          | -                                     |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (not applicable)

---
*Based on Constitution v0.1.1 - See `.specify/memory/constitution.md`*
