# DRX: Tracking (v0.9)

**Mål:** Stabilare trajectories än enkel NN (nearest neighbor) utan tunga beroenden i CI.

## Alternativ
- **NN** (default): närmsta centerpunkt – snabbt men kan hoppa.
- **SortLite** (ny): enkel IoU-baserad associering till tidigare ruta; fallback till högst conf om IoU < tröskel.

## Parametrar
- `iou_thr` (0.2 default) – hur nära samma ruta måste ligga mellan frames för att räknas som samma objekt.
- `coverage` – andel frames där vi hade spårning (0..1). Ingår i `quality_score`.

## Quality-score (v2)
- **Grön**: kalibrerad, ≥60 FPS, ≥4 punkter och coverage ≥0.6
- **Gul**: ≥30 FPS, ≥3 punkter och coverage ≥0.4
- **Röd**: annars.

## Nästa steg
- Byt ut SortLite mot ByteTrack/SORT i runtime (server), men behåll SortLite i CI.
