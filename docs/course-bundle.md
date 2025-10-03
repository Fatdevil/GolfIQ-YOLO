# Course Bundle API

The course bundle API exposes GeoJSON bundles describing the spatial data for
individual golf courses. Bundles are file-backed today for simplicity, with a
clear migration path to PostGIS or other spatial backends in the future.

## Endpoints

- `GET /course/{course_id}` – returns a GeoJSON `FeatureCollection` containing
  all features for the course. The response includes cache headers to support
  offline sync.
- `GET /course/{course_id}/holes/{hole_number}` – returns a GeoJSON
  `FeatureCollection` scoped to a single hole.

Both endpoints emit:

- `Cache-Control: public, max-age=<seconds>` using a 30-day default TTL.
- `ETag: "<hash>"` representing the current bundle state. Clients should send
  the same value in the `If-None-Match` request header to receive `304
  Not Modified` responses when nothing has changed.

## Bundle structure

The payload is a standard GeoJSON `FeatureCollection`:

```json
{
  "type": "FeatureCollection",
  "properties": {
    "course": {
      "id": "pebble-creek",
      "name": "Pebble Creek (Sample)",
      "hole_count": 2,
      "holes": [
        {"number": 1, "name": "Creekside", "par": 4, "yardage": 412},
        {"number": 2, "name": "Overlook", "par": 3, "yardage": 168}
      ]
    }
  },
  "features": [
    {
      "type": "Feature",
      "id": "pebble-creek-1-pin",
      "geometry": {"type": "Point", "coordinates": [-122.4005, 37.7908]},
      "properties": {"kind": "pin", "hole": 1}
    },
    {
      "type": "Feature",
      "id": "pebble-creek-1-green-front",
      "geometry": {"type": "Point", "coordinates": [-122.4007, 37.7906]},
      "properties": {"kind": "green", "position": "front", "hole": 1}
    }
  ]
}
```

Each hole response mirrors the structure, adding a `properties.hole` object with
basic metadata about that hole.

## Client caching example

```bash
curl -i https://api.golfiq.example/course/pebble-creek
# ... inspect ETag from response ...

curl -i https://api.golfiq.example/course/pebble-creek \ \
  -H 'If-None-Match: "<etag-from-first-response>"'
```

When the bundle is unchanged, the server returns `304 Not Modified` with the
same caching headers, allowing clients to skip downloading the full GeoJSON.
