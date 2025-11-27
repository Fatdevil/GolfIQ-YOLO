# CI och coverage

## Workflow-översikt
- **ci.yml**: Kör black, flake8 och pytest med coverage för `server/tests`. PR:er gate:as via `.github/scripts/coverage_gate.py`; main uppdaterar badge/baseline automatiskt.【F:.github/workflows/ci.yml†L1-L65】
- **cv-engine-coverage.yml**: Verifierar CV-engine komponenter och coveragegränser (se `.github/workflows/cv-engine-coverage.yml`).
- **web.yml**: Bygger och testar webklienten (Vite/React) för förändringar i web-koden.
- **android-ci.yml / ios-ci.yml**: Plattformsspecifika byggen och tester för mobilapparna.
- **static-analysis.yml**: Samlar statiska analyser/linting utöver huvud-CI.
- **release.yml / tag-release.yml**: Automatiserar releaseflöden, badges och taggar.
- Övriga specialflöden: golden regression, bench/edge-bench, auto-merge-green, store-assets och training-validate körs beroende på filer/etiketter.

## Coveragehantering
- Teststeget i `ci.yml` kör `pytest -q server/tests --cov=server --cov-report=xml --maxfail=1` och laddar upp `coverage.xml` som artefakt.【F:.github/workflows/ci.yml†L29-L55】
- `coverage_gate.py` tillåter ±0.25 tolerance på PR; på main uppdateras `.github/coverage-baseline.json` och README-badge automatiskt.【F:.github/workflows/ci.yml†L55-L65】
- Ingen separat coverage-konfiguration finns för webben i repo; web-flödet fokuserar på build/test.
