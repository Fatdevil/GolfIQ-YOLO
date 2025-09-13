# Repository Status

## CI & Coverage
- [x] [ci.yml](https://github.com/Fatdevil/GolfIQ-YOLO/actions/workflows/ci.yml) – lint & tests
- [x] Soft coverage gate active ([coverage_gate.py](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/scripts/coverage_gate.py))
- [x] Baseline tracked in [coverage-baseline.json](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/coverage-baseline.json) (66.13%)
- [x] README badge shows 66%
- [x] `coverage.xml` uploaded ([latest run](https://github.com/Fatdevil/GolfIQ-YOLO/actions/runs/17699785796), [artifact](https://github.com/Fatdevil/GolfIQ-YOLO/actions/runs/17699785796/artifacts/4003516480))

## Automation (control plane)
- [x] Runner ([codex-runner.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/codex-runner.yml))
- [x] PR Repair ([pr-repair.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/pr-repair.yml))
- [x] Bulk PR Sync ([bulk-pr-sync.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/bulk-pr-sync.yml))
- [x] Tag & Release ([tag-release.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/tag-release.yml))

## Governance
- [x] Dependabot ([dependabot.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/dependabot.yml))
- [x] PR template ([PULL_REQUEST_TEMPLATE.md](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/PULL_REQUEST_TEMPLATE.md))
- [x] Issue templates ([ISSUE_TEMPLATE/](https://github.com/Fatdevil/GolfIQ-YOLO/tree/main/.github/ISSUE_TEMPLATE))
- [x] CODEOWNERS ([CODEOWNERS](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/CODEOWNERS))

## Static Analysis
- [ ] mypy
- [ ] bandit
- [ ] pip-audit

## App & CV
- [x] server tests ([test_health_api.py](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/tests/test_health_api.py))
- [ ] cv_engine skeleton

## Open PRs
| # | Title | Checks | Update branch? | Run |
|---|-------|--------|----------------|-----|
| [21](https://github.com/Fatdevil/GolfIQ-YOLO/pull/21) | feat(server): staging profile (/health), optional API key + CORS, run scripts, and tests | tests failing | yes | [run](https://github.com/Fatdevil/GolfIQ-YOLO/actions/runs/17621189209) |
| [19](https://github.com/Fatdevil/GolfIQ-YOLO/pull/19) | chore: add pre-commit (black, isort, flake8) and CI lint job | lint failing | yes | [run](https://github.com/Fatdevil/GolfIQ-YOLO/actions/runs/17615789457) |
