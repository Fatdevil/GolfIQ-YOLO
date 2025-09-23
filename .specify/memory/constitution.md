<!--
Sync Impact Report
Version change: template -> 0.1.0
Modified principles:
- (new) Test & Quality Gates
- (new) Performance & UX
- (new) Security & Compliance
- (new) Observability
- (new) Spec-Driven Delivery
Added sections:
- Operational Reliability & Compliance
- Delivery Workflow & Decision Gates
Removed sections:
- None
Templates requiring updates:
- updated .specify/templates/plan-template.md
- updated .specify/templates/spec-template.md
- updated .specify/templates/tasks-template.md
Follow-up TODOs:
- TODO(RATIFICATION_DATE): set on first merge to main
-->

# GolfIQ-YOLO Constitution

## Core Principles

### Test & Quality Gates
- Backend core test coverage MUST be >=70%; critical UI flows MUST be >=50%.
- Branch `main` MUST enforce a coverage gate; only fully green CI pipelines may auto-merge.
- CI MUST run lint and format jobs; every major feature MUST ship with an end-to-end happy-path test.
Rationale: Guardrails keep regressions visible and ensure the mainline is always releasable.

### Performance & UX
- Backend endpoints MUST maintain P95 latency <300 ms under expected load.
- Primary mobile views MUST deliver LCP <2.5 s.
- AR calibration MUST finish within <=8 s and re-centering MUST respond within <=2 s.
Rationale: Fast feedback on range and on-course flows preserves player trust and usability.

### Security & Compliance
- Release candidates MUST have zero HIGH findings in bandit and pip-audit.
- Secrets MUST be sourced from environment variables or secret stores (e.g., KeyVault); no secrets may live in the repository.
- Logs MUST exclude PII to remain GDPR-compliant.
Rationale: Security-first posture maintains regulatory compliance and stakeholder confidence.

### Observability
- Every deployment MUST expose `/health`, Prometheus metrics, and build metadata.
- KPI telemetry MUST track calibration time and P95 latency in dashboards.
- Instrumentation MUST be updated whenever flows or critical components change.
Rationale: Continuous insight surfaces incidents before customers experience them.

### Spec-Driven Delivery
- Major features MUST progress through `/specify -> /plan -> /tasks` before implementation starts.
- Definition of Done MUST be captured in the spec and reflected in plan/tasks outputs.
- Breaking changes MUST include documented migration steps in `/plan`.
Rationale: Intent-first workflows prevent scope drift and protect delivery quality.

## Operational Reliability & Compliance
- Release builds MUST sustain >=99.5% crash-free sessions across supported clients.
- CI MUST block merges when Definition of Done or coverage gates fail.
- Security scans and dependency updates MUST run before release to ensure zero HIGH findings.
- Observability endpoints and dashboards MUST stay functional in staging and production.
These safeguards keep the platform stable during growth and aligned with contractual obligations.

## Delivery Workflow & Decision Gates
- Features MUST NOT merge until coverage, performance, security, and observability metrics are met and documented in `/plan`.
- `/plan` MUST include migration and rollback steps for every breaking change prior to coding.
- Deviations from principles MUST be logged in `/plan` (Complexity/Deviation tracking) and approved before `/tasks` execution.
- The owning team MUST review telemetry and coverage reports at each merge decision.
This workflow enforces accountable collaboration and transparent risk management.

## Governance
- Amendments require joint approval by the tech lead and product lead, captured alongside the commit updating `.specify/memory/constitution.md` with rationale.
- Versioning follows SemVer (MAJOR for incompatible governance changes, MINOR for new principles/sections, PATCH for clarifications).
- The ratified constitution undergoes quarterly review; compliance reviews run at each release-readiness checkpoint.
- Violations post-merge MUST trigger an action plan recorded in `/plan` and a follow-up telemetry review.
- Runtime guides (README, docs, agent templates) MUST remain synchronized with this constitution.

**Version**: 0.1.0 | **Ratified**: TODO(RATIFICATION_DATE): set on first merge to main | **Last Amended**: 2025-09-23
