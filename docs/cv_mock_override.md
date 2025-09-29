# CV Mock Override Behavior

The CV APIs default to the mock inference backend, but the default can now be
configured per environment and overridden per request.

## Default

Set the `CV_MOCK` environment variable (defaults to `true`) to choose which
backend is used when no request override is provided.

```
# .env
CV_MOCK=true  # or false
```

## Override Precedence

The backend used for a given request is determined in the following order:

1. Query parameter `mock` (e.g. `/cv/analyze?mock=false`).
2. Header `x-cv-mock: true|false`.
3. Body field `mock` (JSON or multipart form field, depending on the endpoint).
4. Environment default (`CV_MOCK`).

The first value that is provided is used. All overrides accept common boolean
strings such as `true`, `false`, `1`, or `0`.

## Examples

```http
POST /cv/analyze?mock=false
x-api-key: <key>

--multipart boundary--
Content-Disposition: form-data; name="frames_zip"; filename="frames.zip"
Content-Type: application/zip
```

```http
POST /cv/analyze/video
x-api-key: <key>
x-cv-mock: true

--multipart boundary--
Content-Disposition: form-data; name="video"; filename="swing.mp4"
Content-Type: video/mp4
```

```http
POST /cv/analyze
Content-Type: multipart/form-data; boundary=boundary

--boundary
Content-Disposition: form-data; name="mock"

true
--boundary
Content-Disposition: form-data; name="frames_zip"; filename="frames.zip"
Content-Type: application/zip
```

Response headers now include `x-cv-source: mock|real` to indicate the backend
used for the request.
