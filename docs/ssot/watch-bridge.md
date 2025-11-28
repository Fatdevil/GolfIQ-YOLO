# Watch-/HUD-brygga

## Flöden
- **HUD snapshot**: Klienten POSTar till `/api/watch/hud/hole` med `memberId`, `runId`, önskat `hole` samt valfri `courseId` och GNSS. Endpoint bygger `HoleHud` via `build_hole_hud`, auto-detekterar hål (hero + legacy bundles) och kompletterar med green-avstånd om kurs och GNSS anges.【F:server/api/routers/watch_hud.py†L12-L71】【F:server/watch/hud_service.py†L1-L112】
- **Tick/heartbeat**: `/api/watch/hud/tick` returnerar lätta fält (avstånd, playsLike_m, tips) och uppdaterar hål baserat på auto-detect. Distansberäkning mot bundle sker om GNSS skickas.【F:server/api/routers/watch_hud.py†L73-L119】
- **Watch pairing**: Pairing-kod skapas via `/api/watch/pair/code`; enhet registreras (`/api/watch/devices/register`), binds till kod (`/api/watch/devices/bind`) och får token (`/api/watch/devices/token`). SSE-ström levereras på `/api/watch/devices/stream` och klienten ACK:ar med `/api/watch/devices/ack`. RateLimiter skyddar från missbruk.【F:server/api/routers/watch_pairing.py†L81-L200】
- **Quick Round-synk**: `/api/watch/quickround/sync` väljer primärenhet, validerar course bundle och pushar HUD-data via watch-bryggan till enheten.【F:server/api/routers/watch_quickround.py†L14-L62】
- **Tips-stream**: Tips kan postas och strömmas via `/api/watch/{member_id}/tips` och `/api/watch/{member_id}/tips/stream` för att nå anslutna enheter.【F:server/api/routers/watch_tips.py†L34-L68】

## Databyggnad
- `build_hole_hud` kombinerar coursebundles, GNSS, miljö (vind/temp/elevation), run-kontekst (event, tournament_safe), strokes-gain och senaste tips för att generera `HoleHud` och `HudTip`. Avstånd till green/front/back räknas via bundle-geometri och haversine.【F:server/watch/hud_service.py†L1-L172】【F:server/watch/hud_service.py†L180-L217】
- `resolve_hole_number` prioriterar hero-bundles för auto-detect och faller tillbaka på legacy-geometri; `AUTO_DETECT_MIN_CONFIDENCE` styr när auto-suggestion får override:a önskat hål.【F:server/watch/hud_service.py†L11-L80】
- Planen (`free`/`pro`) hämtas via API-nyckel och styr vilka fält som exponeras. Pro behåller plays-like och tips, medan free sätter `caddie_silent_reason="plan_gated"` och returnerar basavstånd för bakåtkompatibilitet.【F:server/watch/hud_service.py†L130-L172】
- Caddie-råd (`advise`) används för plays-like och klubbsuggestion; defaultbag finns i `DEFAULT_BAG_CARRIES_M` när spelaren saknar bag-data.【F:server/watch/hud_service.py†L1-L40】【F:server/watch/hud_service.py†L112-L172】

## Felhantering & offline
- Pairing-rutterna har rate limiting och returnerar 404/410 för okända eller utgångna koder; 401 när device-secret/token inte matchar. Tokenverifiering krävs för SSE-ström och ackar.【F:server/api/routers/watch_pairing.py†L124-L199】
- HUD-bygget tolererar saknad bundle/GNSS och fyller `None` på avstånd vid fel; tips saknas när inga finns i tip-bussen. Auto-detect kräver konfidens över minimi, annars respekteras manuellt hålval.【F:server/watch/hud_service.py†L60-L112】【F:server/watch/hud_service.py†L180-L217】
