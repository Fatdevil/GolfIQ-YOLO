# Quickstart: CaddieCore v1 Recommendation Flow

## Prerequisites
- Python 3.11 with project dependencies installed (pip install -r requirements-dev.txt).
- FastAPI server running locally (uvicorn server.app:app --reload).
- Test fixture file: 	ests/fixtures/caddie_core/demo_shots.json (to be added during implementation).

## Step 1: Seed mock shot data
`
python scripts/seed_caddie_demo.py --input tests/fixtures/caddie_core/demo_shots.json
`
Outputs aggregated stats cached for range/on-course scenarios.

## Step 2: Call POST /caddie/recommend (range scenario)
`
curl -X POST http://localhost:8000/caddie/recommend \
  -H "Content-Type: application/json" \
  -d @specs/001-feature-caddiecore-v1/contracts/examples/range_request.json | jq .
`
Expect HTTP 200 with:
- ecommendation.club = 7i (for demo dataset)
- explain_score with weights summing to 1.0
- confidence = high

## Step 3: Call POST /caddie/recommend (on-course hazard)
`
jq '.target.hazard_distance_m = 135 | .scenario = "on_course"' \
  specs/001-feature-caddiecore-v1/contracts/examples/range_request.json \
  | curl -X POST http://localhost:8000/caddie/recommend \
      -H "Content-Type: application/json" \
      -d @- | jq .
`
Expect response to include:
- conservative_club populated
- hazard_flag = true
- Explain-score showing dispersion_margin weight >=0.3

## Step 4: Validate telemetry & metrics
`
curl http://localhost:8000/metrics | rg 'caddie_recommend_latency_ms'
`
Ensure histogram shows recent observations with scenario labels. Also check structured logs contain 	elemetry_id and factor weights.

## Step 5: Run automated tests
`
pytest tests/contract/test_caddie_recommend.py \
       tests/unit/caddie_core/test_engine.py \
       tests/unit/caddie_core/test_explain.py \
       tests/integration/test_caddie_recommend_range.py \
       tests/integration/test_caddie_recommend_on_course.py \
       --maxfail=1 --disable-warnings -q
`
All tests must pass; coverage must remain >=70% backend overall and >=50% targeted UI flows (validated in CI).

## Step 6: Performance spot-check
`
python tests/perf/profile_caddie_recommend.py --iterations 200 --scenario range
`
Verify report shows P95 latency <50 ms and mean <30 ms.

## Step 7: Security and compliance
`
pip install -r requirements-dev.txt
bandit -r server/services/caddie_core server/routes/caddie_recommend.py
pip-audit
`
Both tools must report zero HIGH findings before release.

## Step 8: Final checklist
- [ ] /health endpoint reports caddie_core module ready.
- [ ] Telemetry dashboard receives histogram samples for range and on_course scenarios.
- [ ] Docs updated (API reference + READMEs) with new endpoint description.

