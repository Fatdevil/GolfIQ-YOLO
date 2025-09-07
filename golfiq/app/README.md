# App UI update (calibrate + infer demo)

- Adds `App.tsx` with two tabs: **Kalibrera** (calls `/calibrate`) and **Analys (demo)** (calls `/infer` in *detections* mode).
- `lib/api.ts` contains helper functions and a `mockDetections()` generator.
- Start the server on port 8000, then run the app with `npx expo start` and press the buttons.

> Next step: replace mock detections with real frames from the camera and use `frames_b64` mode when YOLO runtime is enabled.
