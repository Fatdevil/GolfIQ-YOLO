# Research Log: CaddieCore v1

**Date**: 2025-09-23  
**Scope**: Dispersion driven club recommendation core + explain-score

## Key Questions
1. What statistical model and parameters best approximate dispersion with limited shot history?  
2. How do we translate wind, elevation, and lie adjustments into carry deltas compatible with gaussian estimates?  
3. What heuristic defines confidence tiers (low/medium/high) based on shot sample size and recency?  
4. Which telemetry metrics expose inference health without leaking PII?  
5. How do we bound performance (<50 ms P95) when using Python-based math libraries?

## Findings & Decisions

### Gaussian dispersion parametrization
- **Decision**: Use normal distribution per club with mean carry (mu_carry), standard deviation carry (sigma_carry), and lateral standard deviation (sigma_lateral).  
  - Safety margin formula: safety_margin = k_sigma * sigma_carry + hazard_buffer.  
  - Chosen k_sigma = 1.0 (approx 68% conf) for main recommendation, k_sigma = 1.5 for conservative variant.  
- **Rationale**: Keeps compute trivial (numpy operations) and interpretable while matching DoD requirement for gaussian dispersion.  
- **Alternatives**: Student-t distribution (discarded due to heavier math cost and limited sample counts); percentile bootstrap (discarded because 200-sample dataset still noisy per club).

### Environmental adjustments
- **Decision**: Convert wind and elevation into effective distance adjustments before evaluating dispersion:  
  - Wind: project vector onto target line, 1 m/s headwind -> +1.5 m carry demand; tailwind -> -1.2 m; crosswind influences lateral margin by +0.5 m per m/s.  
  - Elevation: +/-0.8 m carry change per vertical meter (positive for uphill).  
  - Lie penalty: tee = 0, fairway = +0, rough = +5 m demand plus +1 sigma lateral.  
- **Rationale**: Simple coefficients derived from USGA guidelines; fast to compute and explain.  
- **Alternatives**: Launch monitor physics (Trackman style) would exceed scope and performance budget.

### Confidence tiers & fallback logic
- **Decision**:  
  - low: <120 shots or sigma_carry > 15 -> conservative recommendation forced.  
  - medium: 120-200 shots or sigma between 10-15.  
  - high: >=200 shots and sigma <=10.  
  - When hazard distance missing, treat as medium and annotate explain-score.  
- **Rationale**: Aligns with DoD requiring >=200 shots for nominal dataset; provides deterministic thresholds for UI badge.

### Explain-score weighting
- **Decision**: Compute raw contributions (target gap, wind effect, elevation effect, lie penalty, dispersion margin), take absolute value, normalize to sum 1.0, and output top three factors with 0-1 scores.  
- **Rationale**: Guarantees weights sum to 1 and can be rendered consistently; ties broken by deterministic order.  
- **Alternatives**: SHAP values out of scope; rule engine considered too rigid.

### Telemetry & observability
- **Decision**: Emit Prometheus histogram caddie_recommend_latency_ms with labels {scenario: range|on_course, confidence} and counter caddie_recommend_requests_total. Include structured log entry with factor weights and hazard margin.  
- **Rationale**: Matches constitution observability principle; integrates with existing metrics middleware.  
- **Alternatives**: External tracing via OpenTelemetry deferred until multi-service rollout.

### Performance validation
- **Decision**: Use warm single-threaded FastAPI test with uvicorn worker; ensure numpy computations vectorize over 14 clubs max. Pre-load aggregates per request to avoid disk I/O (mock data cached).  
- **Rationale**: Keeps p95 under 50 ms; caching shot aggregates reduces repeated math.

## Open Items
- Monitor in production whether coefficients need per-player tuning (logged for analytics). No blocking unknowns for v1 implementation.

