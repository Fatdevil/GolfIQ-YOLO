# Watch HUD Diagnostics

The QA HUD overlay now includes a **Watch HUD** diagnostics card. You can find it in the status panel on the phone build once the QA gate is open.

## Capability row

* **Android / iOS** &mdash; shows whether the corresponding native bridge is present and exposes the required API surface (`isCapable`, `sendHUD`/`sendHUDB64`).
* Both values will read `✕` when you run in Expo web or a simulator without the native bridge.

## Last send row

* Displays `OK` when the latest transfer returned `true` from the bridge. `Fail` means the send either threw or returned a falsy value.
* The timestamp is shown relative to “now” (e.g. `3s ago`).
* Byte count reflects the decoded payload size (pre-base64) that was last attempted.

## Buttons

* **Send now** &mdash; immediately re-encodes the current HUD payload and pushes it to the bridge. This is always available when a payload is ready, even if auto-send is disabled.
* **Toggle auto-send** &mdash; flips the in-memory flag that allows the HUD to stream updates continuously. Use this to freeze updates while debugging. The toggle resets when the screen unmounts.

## Common checks

1. If capability is `✕` on a physical device, verify the native module is linked and `WatchBridge.isCapable()` resolves `true` when called directly.
2. When the byte count is unexpectedly high (>2 KB), inspect the payload contents in `shared/watch/codec.ts` and ensure optional strategy data is bounded.
3. Use the “Send now” button after tweaking planner inputs to confirm the watch reflects the latest HUD data without waiting for the debounce timer.
