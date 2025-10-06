# In-app feedback & bug reports

GolfIQ clients ship an in-app feedback modal so field teams can flag issues without leaving the session. This page captures how the feature behaves across platforms and what information reaches our telemetry backend.

## Categories

Users can file three kinds of feedback:

- **Bug** – crashes, frozen UI, upload issues, or other defects.
- **UI** – layout quirks, confusing flows, or translations.
- **Accuracy** – club/ball metrics, shot tagging, or QA anomalies.

Each entry routes through the shared `/telemetry` endpoint with `event: "user_feedback"`. The payload contains the selected category and the short free-form description that the user entered.

## Attachments & context

The mobile clients automatically attach a lightweight context bundle:

- The most recent QA summary emitted by the analyzer (quality label, captured timestamp, and metrics snapshot when available).
- Device platform, OS version, and the locally cached runtime tier.
- Optional routing hints (email/webhook) when the deployment defines additional sinks.

**No personally identifiable information is collected or transmitted.** The payload omits names, email addresses, and raw media. This keeps the workflow compliant while still supplying enough detail for on-call engineers to reproduce issues quickly.

## Flight-recorder access

Feedback events are persisted in the flight recorder alongside other telemetry. The web admin view at `/admin/feedback` surfaces the latest submissions, provides per-category counts, and shows the attached QA snapshot/device tier so engineers can triage without digging through JSON.
