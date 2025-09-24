<!--
Sync Impact Report
Version change: 0.1.0 -> 0.1.1
Modified principles:
- Test & Quality Gates (clarified CI gates and TDD evidence)
- Performance & UX (tightened language, no metric change)
- Security & Compliance (clarified scanning scope)
- Observability (clarified telemetry obligations)
- Spec-Driven Delivery (reinforced artifact traceability)
Added sections:
- None
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md (version reference updated)
- ✅ .specify/templates/spec-template.md (reviewed, still aligned)
- ✅ .specify/templates/tasks-template.md (reviewed, still aligned)
Follow-up TODOs:
- TODO(RATIFICATION_DATE): set on first merge to main
-->

# GolfIQ-YOLO Constitution

## Core Principles

### Test & Quality Gates
- Backend core coverage MUST stay >=70%; coverage for critical UI flows MUST stay >=50%.
- Branch `main` MUST enforce a CI coverage gate; only fully green pipelines may auto-merge.
- CI MUST run lint and format jobs; each major feature MUST ship with an end-to-end happy-path test before merge.

*Rationale:* Guardrails keep regressions visible and ensure `main` is always releasable.

### Performance & UX
- Backend endpoints MUST maintain P95 latency <300 ms under expected load.
- Primary mobile views MUST deliver LCP <2.5 s.
- AR calibration MUST finish within <=8 s and re-centering MUST respond within <=2 s.

*Rationale:* Fast feedback on range and on-course flows preserves player trust and usability.

### Security & Compliance
- Release candidates MUST report zero HIGH findings in bandit and pip-audit results.
- Secrets MUST be sourced from environment variables or secret stores (e.g. KeyVault); repositories may not contain secrets.
- Logs MUST exclude PII to remain GDPR-compliant.

*Rationale:* A security-first posture maintains regulatory compliance and stakeholder confidence.

### Observability
- Every deployment MUST expose `/health`, Prometheus metrics, and build metadata.
- KPI telemetry MUST track calibration time and P95 latency in dashboards.
- Instrumentation MUST be updated whenever flows or critical components change.

*Rationale:* Continuous insight surfaces incidents before customers experience them.

### Spec-Driven Delivery
- Major features MUST progress through `/specify -> /plan -> /tasks` before implementation starts.
- Definition of Done MUST be captured in the spec and reflected in plan/tasks outputs.
- Breaking changes MUST include documented migration steps in `/plan` before code merges.

*Rationale:* Intent-first workflows prevent scope drift and protect delivery quality.

## Operational Reliability & Compliance
- Release builds MUST sustain >=99.5% crash-free sessions across supported clients.
- CI MUST block merges when Definition of Done evidence or coverage gates fail.
- Security scans and dependency updates MUST complete before release to guarantee zero HIGH findings.
- Observability endpoints and dashboards MUST remain functional in staging and production.

*Rationale:* These safeguards keep the platform stable during growth and aligned with obligations.

## Delivery Workflow & Decision Gates
- Features MUST NOT merge until coverage, performance, security, and observability metrics are met and documented in `/plan`.
- `/plan` MUST include migration and rollback steps for every breaking change before implementation begins.
- Deviations from principles MUST be logged in `/plan` (Complexity/Deviation tracking) and approved before `/tasks` execution.
- The owning team MUST review telemetry and coverage reports at each merge decision.

*Rationale:* This workflow enforces accountable collaboration and transparent risk management.

## Governance
- Amendments require joint approval by the tech lead and product lead, captured alongside the commit updating `.specify/memory/constitution.md` with rationale.
- Versioning follows SemVer (MAJOR for incompatible governance changes, MINOR for new principles/sections, PATCH for clarifications).
- The ratified constitution undergoes quarterly review; compliance reviews run at each release-readiness checkpoint.
- Violations post-merge MUST trigger an action plan recorded in `/plan` and a follow-up telemetry review.
- Runtime guides (README, docs, agent templates) MUST remain synchronized with this constitution.

**Version**: 0.1.1  **Ratified**: TODO(RATIFICATION_DATE): set on first merge to main  **Last Amended**: 2025-09-24
