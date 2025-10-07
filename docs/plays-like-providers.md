# Plays-Like Provider Proxies

These proxy endpoints fan out to the Open-Meteo APIs (and OpenTopoData fallback for elevation)
to provide normalized data for the "plays like" feature across clients. Responses are cached in-memory and
on-disk to reduce quota impact and to allow lightweight revalidation with `ETag`.

## Endpoints

| Route | Purpose | TTL | Notes |
| --- | --- | --- | --- |
| `GET /providers/elevation?lat=&lon=` | Elevation in meters for a tee/green coordinate. | 7 days | Primary source is Open-Meteo Elevation, fallback to OpenTopoData ASTER30m. |
| `GET /providers/wind?lat=&lon=&bearing=` | 10m wind speed/direction and optional projection onto a shot bearing. | 15 minutes | Backed by Open-Meteo forecast (UTC hourly grid). Bearing is optional; when omitted the projection fields are `null`. |

Responses include `ttl_s` (seconds remaining on the cached record) and `etag`. The server also emits
`Cache-Control: public, max-age=<ttl>` and `ETag` headers; clients should re-use cached responses until
`ttl_s` expires, then revalidate with `If-None-Match` to avoid duplicate upstream calls. A `304 Not Modified`
extends the cached entry for another TTL window.

## Provider Quotas & Reliability

- **Open-Meteo**: currently unrestricted for light use but we should stay under ~10k requests/day to be good citizens.
  The proxy cache keys coordinates to 5 decimal places (~1 m precision), so repeated lookups for the same hole reuse
  the cached value automatically.
- **OpenTopoData** (fallback for elevation): limited to ~1 request/sec. We only hit it when Open-Meteo fails.
- Both upstream APIs can occasionally return gaps (e.g., missing hourly points). The proxy normalizes errors into HTTP
  `502` responses so clients can fallback to heuristics if needed.

## Data Quality Notes

- Elevation data is approximate and may differ by ±3 m depending on the DEM source; cache TTL is long (7 days) because
  terrain rarely changes and to limit load on providers.
- Wind speed is sampled at 10 m above ground; gusts are not exposed by this proxy. We reproject the vector relative to
the requested bearing so clients can plug the parallel/perpendicular components directly into plays-like formulas.
- When no providers base URL is configured on a client, the shared PlaysLikeService returns stubbed values (`0`) so
  the apps can continue to operate offline or in local development.
