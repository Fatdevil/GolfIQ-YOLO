# Repo Health Audit – GolfIQ-YOLO

## Summary
- CI (main): ✅ – [latest run](https://github.com/Fatdevil/GolfIQ-YOLO/actions/runs/17743207187) concluded **success** on main.
- Coverage badge (README): 87% (OK)
- Auto-merge: ✅ gated on `ci` workflow success on `main`.

## Workflows
- ✅ [ci.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/ci.yml) – updates baseline & badge on `main` and auto-commits README + coverage JSON.
- ✅ [static-analysis.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/static-analysis.yml) – mypy job blocks; bandit & pip-audit marked report-only.
- ⚠️ [cv-engine-coverage.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/cv-engine-coverage.yml) – collects coverage artifact but job is blocking; add `continue-on-error` so coverage is report-only.
- ✅ [video-extras.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/video-extras.yml) – installs `pip install -e ".[video]"` and runs targeted video tests.
- ✅ [auto-merge-green.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/auto-merge-green.yml) – triggered via `workflow_run` on successful `ci@main` and exits quietly when no clean PRs.

## Coverage & README
- ✅ [.github/scripts/coverage_gate.py](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/scripts/coverage_gate.py) – enforces PR tolerance (0.25) and updates baseline/badge on `main`.
- ✅ [.github/coverage-baseline.json](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/coverage-baseline.json) – contains numeric baseline `86.58`.
- ✅ [README.md](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/README.md) – badge block renders explicit percentage (87%).

## Packaging
- ✅ [pyproject.toml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/pyproject.toml) – defines `[project]` with version and metadata.
- ✅ [pyproject.toml#L13-L17](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/pyproject.toml#L13-L17) – `[project.optional-dependencies].video` includes `opencv-python-headless` and `imageio[ffmpeg]`.
- ✅ [pyproject.toml#L19-L21](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/pyproject.toml#L19-L21) – package discovery includes `server*` and `cv_engine*`.
- ✅ Project uses `pyproject.toml` only; no duplicate `extras_require` in `setup.cfg` (file absent).

## Server/API
- ⚠️ [/cv/mock/analyze](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/routes/cv_mock.py) – endpoint exists and tests cover metrics but [confidence is not asserted](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/tests/test_cv_mock_analyze.py).
- ⚠️ [/cv/analyze](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/routes/cv_analyze.py) – ZIP upload endpoint and tests exist, yet [tests skip `metrics.confidence`](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/tests/test_cv_upload_analyze.py).
- ✅ [/cv/analyze/video](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/routes/cv_analyze_video.py) – endpoint wired and [test asserts `metrics.confidence`](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/tests/test_cv_analyze_video.py).

## CV-engine
- ✅ [cv_engine/pipeline/analyze.py](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/cv_engine/pipeline/analyze.py) – uses `YoloV8Detector`, collects tracks, and returns confidence metrics.
- ❌ Expected smoothing/quality modules missing (`cv_engine/metrics` only contains `kinematics` – see directory listing). Add `metrics/smoothing.py` and `metrics/quality.py`.
- ✅ [cv_engine/tests/test_pipeline_mock.py](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/cv_engine/tests/test_pipeline_mock.py) – fast mock-detector pipeline test without heavy deps.

## Run logging
- ❌ `server/storage/runs.py` missing (no storage implementation present under [server/](https://github.com/Fatdevil/GolfIQ-YOLO/tree/main/server)).
- ❌ `/runs` endpoints absent (no `server/routes/runs.py` defined or included).
- ❌ Analyze responses (e.g., [/cv/analyze](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/server/routes/cv_analyze.py)) lack `run_id` even when persistence would be requested.

## Housekeeping
- ✅ [.pre-commit-config.yaml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.pre-commit-config.yaml) present.
- ✅ [.github/dependabot.yml](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/dependabot.yml) configured.
- ✅ PR/Issue templates and CODEOWNERS available in [.github](https://github.com/Fatdevil/GolfIQ-YOLO/tree/main/.github).
- ⚠️ Automatically delete head branches: N/A (cannot verify repository setting from audit context).

## Next actions
1. Make [cv-engine-coverage workflow](https://github.com/Fatdevil/GolfIQ-YOLO/blob/main/.github/workflows/cv-engine-coverage.yml) non-blocking so coverage stays advisory.
2. Restore/add `cv_engine/metrics/smoothing.py` and `metrics/quality.py` modules expected by the pipeline stack.
3. Implement run persistence (`server/storage/runs.py` + `/runs` endpoints) and ensure analyze responses can return `run_id`.
4. Extend `/cv/mock/analyze` and `/cv/analyze` tests to assert `metrics.confidence` similar to the video endpoint.
