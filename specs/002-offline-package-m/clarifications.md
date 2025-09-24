# Clarifications — 002 Offline Course Bundle v1 (offline-package-m)

Open questions to resolve before finalizing the spec:

1) Bundle scope: 9 vs 18 hål
- Ska bundlen alltid omfatta hela 18-hålsbanan om den finns, eller bara 9 hål åt gången (t.ex. 1–9, 10–18)?

2) TTL för cache
- Vilket TTL-värde ska klienter använda innan bundlen måste uppdateras (t.ex. timmar/dagar)?

3) Referenspunkt för hazard-avstånd
- Ska hazardavstånd beräknas från tee, aktuell spelposition, eller ett annat definierat referensläge?

4) Elevation: absoluta vs relativa värden
- Ska elevation anges som absoluta höjder (över havet) eller relativa offset mot green (eller annan referens)?
