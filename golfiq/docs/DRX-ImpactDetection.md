# DRX: Impact Detection – Design & Rationale (v0.9)

**Mål:** Hitta **impact-ögonblicket** robust från två tidsserier (boll & klubb) även utan exakt synk.

## Metod (v0.9)
1. **Tidsjustering:** alignera klubb-serien till bollens tidsstämplar via *nearest timestamp*.
2. **Minsta avstånd:** beräkna euklidiskt avstånd mellan boll- och klubbposition per prov; minsta avstånd = kandidat för impact.
3. **Hastighetskriterium:** beräkna bollens momentanhastighet (px/s). Om post‑impact‑hastighet är >2× pre‑impact eller skiljer >1 px/s → bekräfta impact kring minima.
4. **Fönster:** pre‑impact = [k-2, k), post‑impact = [k, k+2) för hastighetsmedel.

## Varför denna metod?
- Kräver **inte** YOLO/ByteTrack i test (ren numpy), möjlig i CI.
- Fungerar även med viss tidsosäkerhet.
- Går att förbättra senare (ex. filter, Kalman, optisk flow).

## Kända begränsningar
- Kräver rimlig frame‑rate (≥60 fps helst).
- Perspektiv/skal-fel påverkar mph-beräkning → hanteras via kalibrering.

## Nästa (v1.0+)
- Kalman‑filterad handspårning → bättre impact‑peak.
- Fusera club‑path och ball‑path från två vinklar.
- Probabilistisk impact med osäkerhet.
