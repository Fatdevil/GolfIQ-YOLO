# iOS Beta Lane

This directory hosts the Fastlane configuration that ships GolfIQ beta builds to TestFlight.

## Required secrets
Set the following repository or environment secrets before triggering the workflow:

| Secret | Description |
| --- | --- |
| `APP_STORE_ISSUER_ID` | The App Store Connect API Key issuer identifier. |
| `APP_STORE_KEY_ID` | The App Store Connect API Key ID. |
| `APP_STORE_PRIVATE_KEY` | The contents of the `.p8` private key. Base64-encode before storing if you prefer to avoid multiline secrets. |

Optional overrides:

- `IOS_SCHEME`, `IOS_CONFIGURATION` to control the Xcode build.
- `TESTFLIGHT_EXTERNAL` (`true`/`false`) to toggle external distribution.
- `TESTFLIGHT_SKIP_WAIT` (`true`/`false`) to skip waiting for App Store processing.
- `APP_STORE_KEY_DURATION` to override the API key session duration (seconds).

The lane automatically falls back to a generic changelog when `docs/RELEASE_NOTES_v1.2.md` is missing.
