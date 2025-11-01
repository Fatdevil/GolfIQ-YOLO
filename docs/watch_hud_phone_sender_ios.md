# Apple Watch HUD phone sender (iOS)

The iOS bridge mirrors the `WatchHUDStateV1` payload that already powers the Android
watch sender. It relies on the `WatchConnectorIOS` native module, which wraps
`WCSession` to deliver compact, text-only HUD updates to a paired Apple Watch.

## Capability detection

`WatchBridge.isCapable()` resolves a boolean that reflects three runtime checks:

1. `WCSession.isSupported()` — ensures WatchConnectivity APIs are available on the
device.
2. `WCSession.isPaired` — verifies a watch is currently paired with the phone.
3. `WCSession.isWatchAppInstalled` — confirms our companion watch app is installed.

If any prerequisite fails, the bridge resolves `false` so React Native UI can fall
back gracefully. This matches the Android behaviour and remains safe when the
bridge is imported on the web (dynamic `require('react-native')`).

`WatchBridge.sendHUD(...)` writes the payload into the phone's WatchConnectivity
application context. As long as the payload can be base64-decoded, the module
attempts the update and resolves `true`; failures (such as an unavailable
session) resolve `false` without throwing.

The payload is sent using `updateApplicationContext`. This keeps the exchange
deterministic (last-write-wins) and avoids timers or background tasks so the
module stays CI- and tournament-safe.

WCSession is created/activated on the main thread; RN module returns
`requiresMainQueueSetup = true` and `methodQueue = main`.

## Tournament-safe rule

The `WatchHUDStateV1` payload already supports a `tournamentSafe` flag. When the
flag is `true`, the React Native HUD omits strategy recommendations before passing
the payload to `WatchBridge.sendHUD(...)`. The iOS bridge preserves that behaviour;
it never augments the payload, so tournament mode remains strategy-free on both
Android and iOS.

## Future work

The phone sender is ready for a future watchOS companion. Once the watch target is
available we will enable the receiver side to hydrate the same
`WatchHUDStateV1` payload. No WatchKit targets ship in this change — only the
phone-side plumbing.
