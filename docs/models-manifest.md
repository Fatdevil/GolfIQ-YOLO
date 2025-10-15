# Edge Model Manifest & Secure Delivery

This document explains how we publish on-device CV models through a signed manifest, how to build the manifest file, and how to rotate models without breaking released clients.

## Overview

- The API serves `GET /models/manifest.json` with a one-hour cache time and a strong SHA-256 ETag.
- Each manifest entry records the model metadata (runtime, quantisation, input size), the canonical HTTPS download URL, the binary size, and the SHA-256 checksum.
- React Native clients use `shared/edge/model_loader.ts` to fetch the manifest, respect remote-config gates, verify downloaded binaries, and cache them inside the sandbox.

```
{
  "version": 1,
  "recommended": {
    "android": "yolox-nano-int8-320",
    "ios": "yolox-s-fp16-384"
  },
  "android": [
    {
      "id": "yolox-nano-int8-320",
      "url": "https://cdn.example.com/models/android/yolox-nano-int8-320.tflite",
      "sha256": "…",
      "size": 123456,
      "runtime": "tflite",
      "inputSize": 320,
      "quant": "int8"
    }
  ],
  "ios": [
    {
      "id": "yolox-s-fp16-384",
      "url": "https://cdn.example.com/models/ios/yolox-s-fp16-384.mlmodelc",
      "sha256": "…",
      "size": 234567,
      "runtime": "coreml",
      "inputSize": 384,
      "quant": "fp16"
    }
  ]
}
```

Clients automatically fall back to the manifest `recommended` map when the remote-config `edge.model.pinnedId` override is not set.

## Hosting Models

1. Upload binaries to a trusted HTTPS bucket (e.g. S3 or GCS behind CloudFront) using deterministic filenames. Keep platform folders (`android/`, `ios/`) separate to simplify ACLs.
2. Set object ACLs/read permissions so only the CDN origin and the manifest generator have write access. The public CDN should expose the files as read-only.
3. Prefer immutable URLs: rotate the filename when shipping a new build rather than replacing the object in-place.

## Generating the Manifest

Use `scripts/gen_model_manifest.py` to crawl a directory and emit a manifest with fully populated hashes and sizes.

```bash
python scripts/gen_model_manifest.py ./exports/models \
  --base-url https://cdn.example.com/models \
  --recommended android=yolox-nano-int8-320 --recommended ios=yolox-s-fp16-384 \
  --output models/manifest.json
```

- The script looks for per-platform folders (`android/`, `ios/`) and infers `id`, `runtime`, `quant`, and `inputSize` from the filenames.
- SHA-256 digests are computed locally; no network access is required.
- Output is deterministic UTF-8 JSON so it can be committed, diffed, and served safely.

## Rotating Models Safely

1. Upload the new binaries with unique filenames.
2. Regenerate `models/manifest.json` with the script and commit the change.
3. Ship the updated manifest to the API server (or redeploy the service). The `/models/manifest.json` endpoint will automatically emit a new ETag.
4. For a gradual rollout, use Remote Config:
   - `edge.model.pinnedId` can pin a specific model ID on a per-environment basis.
   - `edge.defaults.enforce` (existing gate) forces clients to align with the manifest’s recommended entry.
5. Monitor loader logs for SHA mismatches—any failure will leave the previous cached model in place.

## Permissions & Operational Notes

- Only the release engineering group should have write access to the backing model bucket and the manifest file.
- The manifest endpoint returns 304 responses when the client presents a matching ETag, reducing bandwidth for stable builds.
- Never host unsigned binaries over HTTP; the loader rejects non-HTTPS URLs and deletes corrupted downloads immediately.
- When validating a new release, clear the sandbox (`__resetEdgeModelLoaderForTests` in unit tests or reinstall the app) to ensure the loader performs a full download/verification cycle.
