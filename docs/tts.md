# Caddie Voice (TTS)

The QA AR HUD overlay now includes an optional text-to-speech layer that can read the concise caddie tip aloud in Swedish or English.

## Supported platforms

| Platform | Engine |
| --- | --- |
| QA mobile build (Expo/React Native) | [`expo-speech`](https://docs.expo.dev/versions/latest/sdk/speech/) |
| Web QA overlay | [`window.speechSynthesis`](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis) |
| Node/CLI tooling | Disabled (no-op) |

The voice layer automatically selects the correct backend at runtime. If no speech engine is available the feature silently falls back to text only.

## Using the voice controls

Inside the Caddie panel you will find a **Voice** section with:

- **Voice toggle** – turns auto narration on/off. Disabling voice instantly cancels any active playback.
- **Language selector (SV/EN)** – aligns the narrator with the selected coach language. Switching voice language updates both the narration voice and the textual caddie output.
- **Rate & pitch sliders** – compact sliders (0.5–1.5×) for fine tuning cadence and tone. Defaults are 0.95× for Swedish, 1.0× for English, pitch 1.0.
- **Play tip** – replays the current concise tip on demand (requires Voice ON).
- **Stop** – immediately mutes the current utterance (quick mute).

Whenever a new plan is accepted and Voice is enabled the first tip line is spoken automatically with the configured settings.

## Telemetry

Every spoken tip emits `hud.caddie.tts` with:

- `lang` – resolved voice locale (`sv-SE` or `en-US`)
- `rate` – applied speech rate
- `pitch` – applied speech pitch
- `chars` – number of characters in the narrated tip

The spoken text itself is not logged.

## Privacy

All speech synthesis happens locally on the device/browser. No audio is uploaded, recorded, or transmitted. The feature is additive and QA-gated; disabling Voice restores the previous text-only behavior.

## Troubleshooting

- If the Play button is disabled, ensure Voice is toggled on and a caddie plan is available.
- Browser speech voices load asynchronously; the UI will still function even if `speechSynthesis` exposes only the default voice.
- Mobile builds require the `expo-speech` module to be bundled. If it is missing, Voice silently becomes text-only.
