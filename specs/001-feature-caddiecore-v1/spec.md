# Feature Specification: CaddieCore v1 (dispersion -> klubbrek + explain-score)

**Feature Branch**: `001-feature-caddiecore-v1`  
**Created**: 2025-09-23  
**Status**: Draft  
**Input**: User description: "Launch CaddieCore v1 to recommend clubs using dispersion and surface context with explainable factors."

## Execution Flow (main)
```
1. Parse user description from Input
   -> If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   -> Identify: actors, actions, data, constraints
3. For each unclear aspect:
   -> Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   -> If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   -> Each requirement must be testable
   -> Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   -> If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   -> If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## Quick Guidelines
- Focus on WHAT users need and WHY
- Avoid HOW to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies  
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs
   - Observability instrumentation (health endpoints, metrics, build info, KPI telemetry)
   - Test coverage impact (backend >=70%, critical UI flows >=50%)

---

## Clarifications

### Session 1 (2025-09-23)
- Arkitektur: Funktionell karna i `services/caddie_core/` med adapter och endpoint POST `/caddie/recommend` som anropar karnan.
- Datakallor v1: `PlayerProfile` och `ShotSamples` lases fran mock/fil (ingen extern integration annu).
- Modell: Gaussisk dispersion per klubb (carry medel + standardavvikelse, lateral standardavvikelse). Sakerhetsmarginal beraknas som `k_sigma * stdev + hazard_buffer`. Konservativt alternativ valjs med storre marginal mot hazard.
- Explain-score: Rankar bidrag (target_gap, wind_effect, elevation_effect, lie_penalty, dispersion_margin); normaliserar vikter 0..1.
- Kontrakt: Request JSON ska tacka spelarprofil (id, handikapp, klubblista), shot samples (historik per klubb), maldata (distans, hojd, hazard) och miljo (vind, lie). Svar levererar rekommenderad klubb, konservativt alternativ, P50/P80, osakerhetsniva, explain-score och telemetri-id.

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
En golfare pa range eller bana anger en malflagga och far ett klubbrekommendationskort med huvudval, konservativt alternativ och forklaring.

### Acceptance Scenarios
1. **Given** en golfare med sparad shot history och vald flagga, **When** hen skickar begaran POST /caddie/recommend, **Then** systemet returnerar en klubb med P50/P80 carry-intervall, explain-score topp tre faktorer och ett osakerhetsmatt.
2. **Given** en golfare med hazard inom riskradie, **When** rekommendationen genereras, **Then** svaret innehaller ett konservativt alternativ samt markerar hazardpaverkan i explain-score.
3. **Given** ett on-course-scenario med stark sidvind, **When** golfaren begar rekommendation, **Then** systemet redovisar vinden som en av faktorkomponenterna och loggar inference-tiden i telemetri.

### Edge Cases
- Otillracklig data (<200 shots) leder till "low" osakerhetsniva och defensiv rekommendation.
- Malsatt data saknar hazard-distans; systemet returnerar huvud- och konservativa val men flaggar att hazardinfo saknas.
- Extrem vind eller hojdskillnad som overstiger modellens granser stoppar rekommendationen och ber om manuell review.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: API-et MUST acceptera POST /caddie/recommend med spelarprofil, shot history, malpunkt, miljodata och hazard-distans.
- **FR-002**: Systemet MUST valja huvudklubb baserat pa dispersion (carry och lateral) och maldistans inklusive marginal mot hazarder.
- **FR-003**: Systemet MUST leverera ett konservativt alternativ nar hazardrisk identifieras inom vald marginal.
- **FR-004**: Svaret MUST innehalla P50- och P80-carryintervall for vald klubb.
- **FR-005**: Explain-score MUST lista de tre mest betydelsefulla faktorerna i ordning med varderat viktbidrag.
- **FR-006**: Systemet MUST berakna och returnera ett osakerhetsmatt (low/medium/high) baserat pa datatathet och modellens konfidens.
- **FR-007**: Telemetri MUST logga inference-tid samt vilka faktorer som bidrog till beslutet.
- **FR-008**: Systemet MUST hantera bade range- och on-course-kontext (tee/fairway/rough) utan manuell konfiguration.
- **FR-009**: API-svaret MUST vara lokaliseringsklart (sprakagnostiskt) och kunna anvandas av iOS/Android-klienter.

### Key Entities *(include if feature involves data)*
- **PlayerProfile**: Sammanfattning av spelarens tempo, klubblista och preferenser inklusive identifierare for historik.
- **ShotHistoryAggregate**: Statistisk sammanstallning av tidigare slag per klubb med carry-p50, carry-p80, lateral dispersion och dataquality.
- **TargetContext**: Malflagga med distans, hojdskillnad, vinddata, lie-typ och hazardavstand.
- **RecommendationResult**: Rekommenderad klubb, konservativt alternativ, P50/P80, osakerhetsmatt och explain-score-faktorer.
- **TelemetryRecord**: Loggposter for inferenstid, input-sammanfattning och faktorer som anvandes.

## Non-Functional Targets *(mandatory for major features)*
- **Quality**: Minst 200 shots i testdata for minst en spelare; enhetstester tacker varje faktoromvandling och osakerhetsklass.
- **Performance**: API-svar P95 <50 ms med mockad modell; modelluppslag och berakning far inte overstiga 25 ms.
- **Security & Compliance**: Rekommendationer far inte exponera personidentifierande data; data kommer fran auktoriserade klienter via bestaende API-nyckel.
- **Observability**: `/caddie/recommend` integreras med `/health` metrics, loggar inferenstid samt faktorbidrag och skickar KPI:er till dashboards.

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous  
- [ ] Success criteria are measurable
- [ ] Scope is clearly bounded
- [ ] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [ ] User description parsed
- [ ] Key concepts extracted
- [ ] Ambiguities marked
- [ ] User scenarios defined
- [ ] Requirements generated
- [ ] Entities identified
- [ ] Review checklist passed

---

## Anti-Scope (for awareness)
- Full plays-like modellering (temperatur, lufttryck, green-firmness, regn, turf-interaction) skjuts till framtida iteration.
- Ingen realtidsintegration med externa weather APIs bortom enkel vinddata.
- Ingen databaskonfiguration for fleranvandarhistorik; fokus pa en spelare pilot.


