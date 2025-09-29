# Shared Telemetry Schema

This folder defines the cross-platform telemetry payload shared between the
mobile clients and the backend.

* `telemetry.schema.json` encodes the canonical payload contract.
* Android maps to `com.golfiq.hud.model.Telemetry` and `ShotEvent`.
* iOS maps to `Telemetry` and `ShotEvent` in `ios/Models`.

> The schema intentionally allows nullable fields for optional club tracking
> properties. Only the `timestampMs` field is required.
