# Export traced video

The web app now offers a client-side export flow that replays a run's back-view
video with the tracer overlay and optional telemetry metrics rendered directly
onto a canvas. The frames are captured locally with `MediaRecorder` and
assembled into a downloadable clip.

## Browser support

| Browser | Container | Notes |
| --- | --- | --- |
| Chrome / Edge | WebM (VP9/VP8) | Best experience. MP4 (H.264) is attempted when supported by `MediaRecorder`. |
| Firefox | WebM (VP9/VP8) | Works, though MP4 is not available. |
| Safari (macOS / iOS) | Limited | Safari 16+ exposes `MediaRecorder`, but H.264 recording support is inconsistent. Prefer Chrome when possible. |

The export runs entirely in the browser—no video data is uploaded to the
server. Large recordings can produce sizable blobs; we stream `MediaRecorder`
chunks every second to avoid building the entire recording in memory before the
download is ready.

## Troubleshooting

- If the download prompts for WebM and you require MP4, please switch to the
  latest Chrome/Edge build, which advertises H.264 support via
  `MediaRecorder.isTypeSupported`.
- Very old browsers without `MediaRecorder` will surface an in-app error. In
  those cases, instruct the user to try Chrome on desktop for the export.
