# GolfIQ S16 Demo Quickstart

Följ stegen nedan för att köra en demo av strokes-gained upplevelsen med den inbyggda S16-seeden.

1. **Starta backend med dev-seed aktiv.**
   ```bash
   cd /workspace/GolfIQ-YOLO
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements-dev.txt
   export DEV_SEED_ENABLE=1 REQUIRE_API_KEY=1 API_KEY=demo
   uvicorn server.app:app --reload --port 8000
   ```

2. **Boota webbklienten med SG-flaggan på.**
   SG-gränssnittet är avstängt som standard. Sätt `VITE_FEATURE_SG` till en explicit sann-sträng (t.ex. `1`, `true`, `on`, `yes`, `enable`) när du bygger eller kör webbappen.
   Öppna ett nytt terminalfönster och kör:
   ```bash
   cd /workspace/GolfIQ-YOLO
   npm --prefix web install
   export VITE_FEATURE_SG=1 API_BASE_URL=http://localhost:8000 API_KEY=demo
   npm --prefix web run dev
   ```

3. **Installera verktyg och kör one-click seed-skriptet.**
   I en tredje terminal:
   ```bash
   cd /workspace/GolfIQ-YOLO
   npm install
   export DEMO_BASE_URL=http://localhost:8000 API_KEY=demo
   npm run demo:sg
   ```
   Skriptet fyller in-memory stores med eventet `evt-s16-demo` och dess två runs.

4. **Öppna eventet i webben.**
   Surfa till `http://localhost:5173/event/evt-s16-demo` och vänta tills Strokes-Gained panelerna laddas.

5. **Klicka på “Top SG shots” → “Watch”.**
   Välj valfri rad i listan. “Watch”-knappen ska öppna spelaren och söka in på rätt clip, vilket bekräftar att seeden och ankare fungerar.
