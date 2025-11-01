# Apple Watch HUD Phone Sender (iOS)

## Overview

The iOS phone app mirrors the QA AR HUD payloads to an Apple Watch via
[`WatchConnectivity`](https://developer.apple.com/documentation/watchconnectivity).
The module exposes the same `WatchBridge` TypeScript façade used on
Android so React Native code can broadcast a `WatchHUDStateV1` without
platform-specific branches.

## Capability Detection

* `WatchBridge.isCapable()` resolves to `true` only when:
  * the host device supports `WCSession`,
  * the Apple Watch is paired, and
  * the GolfIQ watch app is installed.
* If the watch app is missing (or the session is inactive) the bridge
  resolves `false`, allowing the UI to degrade gracefully.

## Sending HUD Updates

* `WatchBridge.sendHUD(...)` serializes the HUD payload with the shared
  deterministic JSON codec and forwards it to
  `WatchConnectorIOS.sendHUDB64`.
* The native module activates `WCSession` on the main queue (if needed)
  and pushes the payload via `updateApplicationContext`, returning `true`
  when the watch is reachable.
* Payloads are debounced in `QAArHudOverlayScreen.tsx` (≤ 1 Hz) and
  include `tournamentSafe` so the receiver can adapt its UI.

## Tournament-Safe Behavior

When `tournamentSafe === true`, the React Native layer omits the
`strategy` block before encoding. The iOS bridge therefore never
transmits live club or aim recommendations during tournament-safe
sessions.

## Testing & CI

* Web CI uses mocked React Native modules to assert that both the web and
  iOS fallbacks resolve `false` when the native module is unavailable.
* Xcode builds succeed without adding a WatchKit extension; the phone app
  simply advertises capability based on `WCSession` state.

## Future Work

* Build the dedicated watchOS app + complication to consume the HUD
  payloads.
* Add offline caching/queueing of HUD updates when the watch is not
  immediately reachable.
* Expand telemetry to record transfer timings and failure reasons across
  both mobile platforms.
