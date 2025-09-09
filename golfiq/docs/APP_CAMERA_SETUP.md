# App: Kamera → /infer (frames_b64)

Denna skärm (`CameraInferScreen.tsx`) fångar ~12 bilder i en snabb burst, kodar dem till base64 och skickar till serverns `/infer` med `mode=frames_b64`.

## Steg
1. Sätt serverns IP i appen via `.env` (`EXPO_PUBLIC_API_BASE=http://<server-ip>:8000`) och starta om bundlern.
2. Se till att servern kör YOLO enligt `docs/RUNTIME_SETUP.md` (YOLO_INFERENCE=true, YOLO_MODEL_PATH satt).
3. Öppna fliken **Kamera** → fyll i FPS & m/px (från kalibrering) och serverns modell‑sökväg → tryck “Fånga 12 bilder och analysera”.

> Tips: håll kameran stadig och filma *down‑the‑line*. För bättre resultat, höj FPS (om möjligt) och använd kort slutartid.
