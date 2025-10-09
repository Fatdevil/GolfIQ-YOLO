# Plays-Like Provider Proxies

These provider proxies expose cached, quota-friendly endpoints that our clients
can call for "plays like" computations without hitting third-party APIs
directly. Both proxies sit behind `/providers/*` routes in the FastAPI app.

## Elevation

- **Endpoint:** `GET /providers/elevation?lat=…&lon=…`
- **Upstream:** [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api)
- **Response:**
  - `elevation_m` – surface elevation in metres above sea level.
  - `etag` – stable content hash derived from the cached payload.
  - `ttl_s` – seconds remaining before the cache entry expires.
- **Caching:**
  - Shared memory + file-backed cache (`~/.golfiq/providers/elevation.json`).
  - Entries live for **7 days** (604 800 seconds).
  - Requests with `If-None-Match` matching the cached ETag return **304 Not Modified** and extend the TTL.
- **Quotas & Reliability:**
  - Open-Meteo allows generous unauthenticated usage (≈10k calls/day per IP).
  - The 7-day TTL keeps us comfortably within limits even for dense course maps.
  - Elevation data is derived from ASTER GDEM (≈30 m resolution); expect ±10 m noise in steep terrain.

## Wind

- **Endpoint:** `GET /providers/wind?lat=…&lon=…[&bearing=…]`
- **Upstream:** [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
  - Uses the hourly `wind_speed_10m` and `wind_direction_10m` series.
- **Response:**
  - `speed_mps` – wind speed at 10 m above ground (metres per second).
  - `dir_from_deg` – degrees wind is coming **from** (0° = north).
  - `w_parallel` / `w_perp` – components parallel and perpendicular to the shot
    bearing (set to `null` if `bearing` query param is omitted).
  - `etag`, `ttl_s` analogous to the elevation endpoint.
- **Caching:**
  - Memory + disk cache (`~/.golfiq/providers/wind.json`).
  - Entries live for **15 minutes** (900 seconds) and are keyed by
    `(lat, lon, hour)` to avoid thrashing.
  - Conditional requests with matching `If-None-Match` return **304** and bump the TTL.
- **Quotas & Quality:**
  - Open-Meteo limits anonymous clients to ≈10k calls/day; our cache keeps us
    well under this ceiling even with frequent club selection requests.
  - Forecast wind uses the ECMWF/NOAA blended model; expect ±2 m/s variance in
    gusty conditions and check timestamps when debugging field reports.

## Operational Notes

- File caches are safe to share across processes; they use atomic replace writes.
- Set `GOLFIQ_PROVIDER_CACHE_DIR` to override the default cache directory when
  running in ephemeral containers or tests.
- Treat provider data as **advisory** – always display the TTL to users so they
  know when values were last refreshed.
