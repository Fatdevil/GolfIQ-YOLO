# Data Model — AR-HUD v1 on-course HUD

## Entities

### HUDSession
| Field | Type | Description |
|-------|------|-------------|
| session_id | UUID | Unique identifier per HUD launch |
| platform | enum(iOS, Android) | Client platform used |
| device_model | string | Canonical device (e.g., iPhone14, Pixel7) |
| os_version | string | OS build for reproducibility |
| start_timestamp | ISO8601 | Session start |
| end_timestamp | ISO8601? | Session end (nullable until close) |
| thermal_events | array<ThermalEvent> | Logged thermal warnings |
| avg_fps | float | Session average fps |
| latency_ms_p50 | float | Median HUD latency |
| latency_ms_p90 | float | P90 HUD latency |
| battery_delta_percent | float | Battery drain per session |
| fallback_triggered | bool | Whether compass fallback activated |
| offline_duration_ms | integer | Milliseconds spent offline |

Relationships:
- One HUDSession owns many Anchors, OverlayElements, FeatureFlagConfigs, TelemetrySamples.

### Anchor
| Field | Type | Description |
|-------|------|-------------|
| anchor_id | UUID | Identifier per anchor |
| session_id | UUID (FK HUDSession) | Owning session |
| anchor_type | enum(pin, layup, reticle, ground_plane) | Anchor classification |
| pose_matrix | float[16] | 4x4 pose matrix |
| stability_confidence | float (0-1) | Confidence score |
| last_revalidated_at | ISO8601 | Timestamp of last revalidation |
| drift_meters | float | Current drift estimate |

Constraints:
- Revalidation required when pose delta exceeds threshold; drift must remain <0.5 m.

### OverlayElement
| Field | Type | Description |
|-------|------|-------------|
| element_id | UUID | Identifier |
| session_id | UUID (FK HUDSession) | Owning session |
| anchor_id | UUID (FK Anchor) | Linked anchor |
| element_type | enum(distance_marker, layup_marker, target_line, wind_hint, safety_banner, offline_badge, perf_overlay) |
| distance_meters | float? | Distance value when applicable |
| wind_tier | enum(calm, breeze, windy)? | Wind classification |
| is_visible | bool | UI visibility |

### TelemetrySample
| Field | Type | Description |
|-------|------|-------------|
| sample_id | UUID | Identifier |
| session_id | UUID (FK HUDSession) | Owning session |
| timestamp | ISO8601 | Sample time |
| metric | string | Metric name (e.g., fps_avg, tracking_quality_p50) |
| value | float | Metric value |
| device_class | string | Derived device bucket |
| sampled | bool | True if part of <=10% detailed trace |

### DeviceProfile
| Field | Type | Description |
|-------|------|-------------|
| profile_id | string | Device key (iphone14, iphone15, pixel7, pixel8) |
| os_version | string | Reference OS |
| chipset | string | SOC identifier |
| thermal_thresholds | object | Platform thermal warning levels |
| battery_capacity_mah | integer | Battery reference |

### FeatureFlagConfig
| Field | Type | Description |
|-------|------|-------------|
| session_id | UUID (FK HUDSession) | Owning session |
| hud_wind_hint_enabled | bool | Default true, flag toggle |
| hud_target_line_enabled | bool | Default true, flag toggle |
| hud_battery_saver_enabled | bool | Default true, flag toggle |
| source | enum(default, feature_service, override) | Flag provenance |

### CachedHole
| Field | Type | Description |
|-------|------|-------------|
| hole_id | string | Hole identifier |
| pin_gps | lat/lng | Pin coordinates |
| layups | array<LayupTarget> | Cached layup points |
| last_synced_at | ISO8601 | Sync timestamp |
| caddie_recommendation | object | Last club suggestion payload |

### ThermalEvent
| Field | Type | Description |
|-------|------|-------------|
| timestamp | ISO8601 | Event time |
| severity | enum(info, warning, critical) | Thermal severity |
| action_taken | enum(log_only, prompt_user, auto_reduce_features) | Device response |

### LayupTarget (embedded)
| Field | Type | Description |
|-------|------|-------------|
| id | string | Layup identifier |
| name | string | Display label |
| distance_meters | float | Distance from golfer |
| hazard_distance_meters | float? | Optional hazard info |

## Notes
- All personally identifiable data excluded; telemetry uses anonymised IDs.
- CachedHole persists per golfer session; cleared when hole completed or stale >24h.
- PerfOverlay metrics are written to TelemetrySample with sampled=true when detailed trace captured.
