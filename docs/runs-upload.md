# Run & Log Background Uploads

GolfIQ supports background uploads for detector runs and QA logs from both Android and iOS clients. Uploads are orchestrated through the `/runs/upload-url` helper and can target either S3/MinIO (via presigned PUT) or the application filesystem fallback.

## Environment Variables

Configure the server by extending `.env`:

| Variable | Description | Default |
| --- | --- | --- |
| `STORAGE_BACKEND` | Storage backend selector (`s3` or `fs`). | `s3` |
| `S3_ENDPOINT` | Custom S3 endpoint (e.g. MinIO). | `http://localhost:9000` |
| `S3_REGION` | Region passed to the S3 client. | `us-east-1` |
| `S3_BUCKET` | Bucket that stores uploaded archives. | `golfiq-runs` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credentials for MinIO/S3; leave blank for IAM roles. | `changeme` |
| `S3_FORCE_PATH_STYLE` | Force path-style requests (set to `1` for MinIO). | `1` |
| `RUNS_TTL_DAYS` | Retention window for uploaded archives. Files older than this are purged. | `30` |

When `STORAGE_BACKEND=fs`, uploads are written under `data/uploads/` inside the server container. S3 mode returns presigned PUT URLs that the clients stream to directly.

## Request Flow

1. The client packages a run archive (`run.zip`) that includes `metrics.json`, `qa.json`, and any impact preview assets.
2. The client calls `POST /runs/upload-url` with `{ "runId": "<id>" }`.
   * For S3, the server responds with `{ url, key, ttl, headers?, expiresAt }`. The client performs a single PUT to `url` with the archive bytes and optional headers.
   * For filesystem fallback, the server responds with `{ formUrl: "/runs/upload", key }`. The client uploads using `multipart/form-data` with fields `file` (the archive) and `key`.
3. After a successful upload, the client posts telemetry: `POST /telemetry` with `{ "event": "upload_complete", "key": "…", "size": <bytes>, "durationMs": <elapsed> }`.

## Background Execution

* **Android** schedules a `WorkManager` job (`RunUploader`) that prefers unmetered networks, applies exponential backoff, and retries automatically on transient failures. The worker chooses PUT vs multipart POST depending on the backend.
* **iOS** registers a `BGProcessingTask` via `RunUploader` to execute uploads in the background. A dedicated background `URLSession` performs the transfer and posts matching telemetry on success.

Both implementations degrade to standard connectivity when unmetered networks are unavailable and surface non-retriable failures to the logs.

## Retention & TTL

The sweeper runs every five minutes and prunes `data/uploads/**` entries older than `RUNS_TTL_DAYS`. For S3, the provided presigned URL lifetime respects `RUNS_TTL_DAYS` (clamped to the S3 limit of seven days) while the longer-term retention is enforced by server-side sweeps or bucket lifecycle policies.

To manually trigger a clean-up you can run:

```bash
python -c "from server.retention.sweeper import sweep_upload_retention; print(sweep_upload_retention('data/uploads', 30))"
```

This removes expired files and empties stale directories.
