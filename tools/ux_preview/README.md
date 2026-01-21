# GolfIQ UX Preview (ux_payload_v1)

Lightweight web renderer for the unified `ux_payload_v1` contract. Use this to demo
READY/WARN/BLOCK states or validate payload compatibility visually.

## Install

```bash
cd tools/ux_preview
npm i
```

## Run

```bash
npm run dev
```

Then open the URL shown by Vite (default: http://localhost:5173).

## Build

```bash
npm run build
```

## How to use

- Paste a raw `ux_payload_v1` object or a full API response containing
  `ux_payload_v1` into the input panel.
- Click **Load example** to load bundled READY/WARN/BLOCK payloads.
- Use **Copy normalized JSON** to copy the normalized payload (tips capped to 3).

## Fetch demo payloads

If the local server is running with demo endpoints, update the base URL and click:
- **Fetch demo swing** → `/cv/analyze?demo=true`
- **Fetch demo range** → `/range/practice/analyze?demo=true`

## Example payloads

Bundled examples live in `public/examples`:
- `ready.json`
- `warn.json`
- `block.json`
