# Data Model: CaddieCore v1

## Overview
Domain objects powering POST /caddie/recommend. Models will live in server/services/caddie_core/models.py (Pydantic) and reuse subsets in FastAPI schemas.

## Entities

### PlayerProfile
- player_id (str): Stable identifier used by clients; no PII.
- handicap_index (float | None): Optional metadata for future tuning.
- clubs (list[str]): Ordered list of club codes (e.g., "PW", "7i").
- dominant_hand (Literal["left","right"] | None): For future wind adjustments (optional).
- Validation: Must contain at least one club; unique club codes.

### ShotSample
- club (str): Must exist in PlayerProfile.clubs.
- carry_m (float): Actual carry distance in meters.
- lateral_m (float): Lateral dispersion (positive = right, negative = left).
- 	imestamp (datetime): When shot was recorded.
- Used only when computing aggregates (not returned to clients).

### ShotAggregate
- club (str)
- count (int): Number of samples contributing (>=1).
- carry_mean (float)
- carry_std (float)
- lateral_std (float)
- last_updated (datetime)
- Derived: classification of confidence tier (low/medium/high) based on counts/std thresholds.

### TargetContext
- 	arget_distance_m (float): Straight-line distance to flag.
- elevation_delta_m (float): Positive = uphill.
- wind_speed_mps (float)
- wind_direction_deg (float): Bearing relative to target line (0 = headwind, 180 = tailwind).
- lie_type (Enum: 	ee, airway, ough).
- hazard_distance_m (float | None): Distance to nearest hazard on line; None if unknown.

### Recommendation
- club (str): Primary recommendation.
- carry_p50_m (float)
- carry_p80_m (float)
- safety_margin_m (float): Distance buffer applied to avoid hazard.
- conservative_club (str | None): Alternative when hazard risk or low confidence.
- confidence (Enum: low, medium, high).
- hazard_flag (bool): True when hazard distance triggered conservative flow.

### ExplainFactor
- 
ame (str): One of 	arget_gap, wind_effect, elevation_effect, lie_penalty, dispersion_margin.
- weight (float): Normalized 0.0-1.0 (sum top 3 = 1.0).
- direction (Enum: positive, 
egative): Indicates whether factor lengthened or shortened the shot.

### RecommendationPayload (request)
- player (PlayerProfile)
- shot_samples (list[ShotSample]): At least 50 entries overall; aggregated server side.
- 	arget (TargetContext)
- scenario (Enum: ange, on_course)

### RecommendationResponse (response)
- ecommendation (Recommendation)
- explain_score (list[ExplainFactor] length 3)
- 	elemetry_id (str): Correlates with logs/metrics.
- generated_at (datetime)

### ErrorEnvelope
- error_code (str)
- message (str)
- details (dict | None)

## Relationships & Notes
- ShotSample data is transformed into ShotAggregate per club at request time (or cached).  
- Recommendation references PlayerProfile clubs; validation ensures both club and conservative_club exist in profile.  
- ExplainFactor.weight values produced by explain module using normalized contributions; they must always be sorted descending.  
- Telemetry uses 	elemetry_id to push histogram/counter metrics (IDs treated as UUID4 strings).

## Validation & Error Handling
- Reject requests when shot_samples missing clubs present in profile or <50 total samples (422).
- Reject if wind_direction_deg not in [0,360) or invalid scenario string (422).
- For low confidence, always emit hazard_flag false unless hazard distance provided; UI uses confidence primarily.

