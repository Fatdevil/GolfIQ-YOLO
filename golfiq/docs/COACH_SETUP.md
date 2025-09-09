# Coach Setup

- Servern har endpointen `POST /coach` och läser `COACH_FEATURE` (true/false). 
- Offline-läge (default): genererar statisk text, bra för demo.
- Online-läge: sätt `COACH_FEATURE=true` och `OPENAI_API_KEY` + `OPENAI_MODEL`.
- Appen har en *Coach*-sektion på både **Analys (demo)** och **Kamera**-flikarna.
