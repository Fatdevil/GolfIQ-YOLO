# Clip Sharing

Short links for clip anchors allow coaches and spectators to share precise shot moments while
respecting existing moderation policies.

## API endpoints

- `POST /api/share/anchor` (requires API key) creates a short link for a specific anchor identified
  by `runId`, `hole`, and `shot`. The API returns the short link (`/s/{sid}`) and the Open Graph
  preview endpoint (`/s/{sid}/o`). Attempts to share hidden, private, friends-only, or event-only
  clips return **409 Conflict**.
- `GET /s/{sid}` redirects (302) to the canonical clip viewer URL with the `?t=` query set to the
  anchor start timestamp in milliseconds.
- `GET /s/{sid}/o` returns a lightweight HTML page with Open Graph and Twitter metadata (title,
  description, and thumbnail) and immediately redirects to the canonical clip URL via JavaScript.
  The image URL is always absolute to ensure correct previews.

## Visibility safeguards

Moderation state is enforced when creating and resolving short links:

- Anchors referencing hidden or non-public clips cannot be shared (`409` on create).
- If a clip is later hidden or its visibility changes, existing short links resolve to **404** to
  avoid exposing restricted content.

## Preview assets

Open Graph metadata references the clip thumbnail via the CDN-aware `rewrite_media_url` helper. If
new CDN rules are introduced, they are automatically respected by the short-link previews.

## Front-end sharing

The web UI adds share buttons to Top SG shot rows and the clip modal. When sharing succeeds the UI
copies the short link (or uses the native Web Share API) and surfaces a "Preview card" link pointing
at `/s/{sid}/o` so the generated OG card can be inspected quickly.
