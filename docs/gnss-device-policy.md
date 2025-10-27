# GNSS device policy

The QA HUD surfaces GNSS health in the overlay and diagnostics tools. When the
platform does not expose detailed satellite metadata we fall back to a
dual-frequency heuristic keyed on known "Pro-precision" Android devices.

## Pro-precision device catalog

The following JSON block is the source for the heuristic used at runtime. Model
name matches are case-insensitive and can hit on either the marketing name or
model ID prefix.

```json
{
  "pro_precision_models": [
    "Pixel 5",
    "Pixel 6",
    "Pixel 6 Pro",
    "Pixel 6a",
    "Pixel 7",
    "Pixel 7 Pro",
    "Pixel 7a",
    "Pixel 8",
    "Pixel 8 Pro",
    "Pixel 8a",
    "Pixel 9",
    "Pixel 9 Pro",
    "Pixel 9 Pro XL",
    "Pixel 9 Pro Fold",
    "Pixel 9a",
    "Galaxy S21",
    "Galaxy S22",
    "Galaxy S23",
    "Galaxy S24",
    "Galaxy Note20 Ultra",
    "Galaxy Z Fold4",
    "Galaxy Z Fold5",
    "Galaxy Z Fold6",
    "OnePlus 10 Pro",
    "OnePlus 11",
    "OnePlus 12",
    "Xiaomi 12",
    "Xiaomi 13",
    "Xiaomi 14",
    "Honor Magic4 Pro",
    "Honor Magic5 Pro",
    "Asus Zenfone 9",
    "Asus Zenfone 10",
    "Sony Xperia 1 IV",
    "Sony Xperia 1 V"
  ],
  "model_id_prefixes": [
    "SM-S90",
    "SM-S91",
    "SM-S92",
    "SM-S93",
    "SM-S94",
    "SM-S95",
    "SM-N98",
    "SM-F93",
    "SM-F94",
    "SM-F95",
    "SM-F96"
  ]
}
```

## Heuristic and UI behaviour

1. If Android reports multi-frequency data (dual-frequency flag, carrier
   frequency list, or signal bands containing `L5`/`E5`) we respect that
   directly.
2. Otherwise we check the device against the JSON catalog above. Matches are
   labelled `L1/L5 ✓`; everything else shows `L1/L5 –`.
3. Accuracy is coloured green below 2 m, yellow between 2–5 m, and red above 5
   m. When red we prompt the user to stand still briefly.

## Improving fix quality

- Step outside or move near a window to reduce multipath interference.
- Hold the phone away from your body and remove magnetic accessories or metal
  cases when possible.
- Stand still for 2–3 seconds before marking shots so the Kalman filter can
  settle.
- Keep Wi‑Fi on when possible; assisted GNSS helps cold starts in dense areas.
