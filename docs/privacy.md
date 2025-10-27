# GolfIQ QA Telemetry Privacy

This document summarizes how QA and beta builds of the GolfIQ HUD handle telemetry and diagnostic
logs.

## What data we collect

QA telemetry focuses on shot planning so that we can validate coaching behaviour. Events such as
`hud.caddie.plan` capture the selected club, aim, risk level, language settings, and whether
multi-curve calculations or advice lines were shown. Device diagnostics (app version, platform,
GNSS health, upload queue status) are collected when you open the About & Diagnostics screen. No
personal identity fields (name, email, phone) are logged.

## Why we collect it

The data helps the coaching team tune club selection, aim, and timing rules, and to detect bugs in
GNSS accuracy or upload reliability before a release. Telemetry is only sent when QA telemetry is
enabled from the About & Diagnostics screen.

## Retention

QA telemetry is stored in controlled log buckets for up to 30 days. Records older than that are
purged automatically. Earlier removal is performed when we receive an erasure request.

## Exporting or erasing your data

* **Export** – Use the **Export logs** action on the About & Diagnostics screen to generate a JSON
  bundle of the recent telemetry that you can save or share with support.
* **Erase locally** – Turn off QA telemetry and clear diagnostics from **Settings → Reset → Clear QA
  telemetry** (or delete the app) to remove stored logs on the device.
* **Erase on server** – Email `privacy@golfiq.dev` with the device ID shown on the About & Diagnostics
  screen. We will delete the associated telemetry within two business days and confirm once done.

For additional details or questions, contact privacy@golfiq.dev.
