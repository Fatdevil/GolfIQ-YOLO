# CI och coverage

## Workflow-översikt
- **ci.yml**: Kör black, flake8 och pytest med coverage för `server/tests`; PR:er gate:as via `.github/scripts/coverage_gate.py`, main uppdaterar badge/baseline automatiskt.【F:.github/workflows/ci.yml†L1-L63】
- **cv-engine-coverage.yml**: Kör cv_engine-tester med coverage och laddar upp rapport (report-only).【F:.github/workflows/cv-engine-coverage.yml†L1-L28】
- **web.yml**: Bygger, typecheckar och testar webklienten (Node 20).【F:.github/workflows/web.yml†L1-L28】
- **android-ci.yml / android-release.yml**: CI- och releasepipelines för Android (bygg/test, signering).【F:.github/workflows/android-ci.yml†L1-L36】【F:.github/workflows/android-release.yml†L1-L40】
- **ios-ci.yml / ios-build.yml**: CI- och byggpipeline för iOS (simulatortester, artifacts).【F:.github/workflows/ios-ci.yml†L1-L36】【F:.github/workflows/ios-build.yml†L1-L35】
- **mobile-beta.yml**: Beta-distribution för mobiler.【F:.github/workflows/mobile-beta.yml†L1-L33】
- **golden-regression.yml / bundle-validate.yml / edge-bench.yml**: Specialflöden för regressionsjämförelse, bundle-validering och edge-benchmarks.【F:.github/workflows/golden-regression.yml†L1-L38】【F:.github/workflows/bundle-validate.yml†L1-L30】【F:.github/workflows/edge-bench.yml†L1-L36】
- **accuracy-gate.yml / rollout-health.yml / retention-hud-snapshots.yml**: Kvalitetskontroller för precision, rollout och retention-batchar.【F:.github/workflows/accuracy-gate.yml†L1-L44】【F:.github/workflows/rollout-health.yml†L1-L35】【F:.github/workflows/retention-hud-snapshots.yml†L1-L31】
- **auto-merge-green.yml / triage-digest.yml / inventory-audit.yml**: Automatiska merge-regler, triage-sammanfattning och inventeringskontroll.【F:.github/workflows/auto-merge-green.yml†L1-L35】【F:.github/workflows/triage-digest.yml†L1-L32】【F:.github/workflows/inventory-audit.yml†L1-L29】
- **release.yml / release-v1_2.yml / tag-release.yml**: Release- och taggflöden för versioner/badges.【F:.github/workflows/release.yml†L1-L40】【F:.github/workflows/release-v1_2.yml†L1-L41】【F:.github/workflows/tag-release.yml†L1-L33】
- **static-analysis.yml / pr-binary-guard.yml / codex-runner.yml**: Statiska analyser, binärkontroller och generativa hjälpskript.【F:.github/workflows/static-analysis.yml†L1-L35】【F:.github/workflows/pr-binary-guard.yml†L1-L32】【F:.github/workflows/codex-runner.yml†L1-L30】

## Coveragehantering
- Teststeget i `ci.yml` kör `pytest -q server/tests --cov=server --cov-report=xml --maxfail=1` och laddar upp `coverage.xml` som artefakt.【F:.github/workflows/ci.yml†L29-L48】
- `coverage_gate.py` tillåter ±0.25 tolerance på PR; på main uppdateras `.github/coverage-baseline.json` och README-badge automatiskt.【F:.github/workflows/ci.yml†L48-L63】
- cv_engine-coverage kör pytest med `--cov=cv_engine` men gates inte PR; används för rapportering.【F:.github/workflows/cv-engine-coverage.yml†L17-L28】
- Webworkflowen kör typecheck/build/test men har ingen separat coverage-gräns definierad.【F:.github/workflows/web.yml†L16-L28】
