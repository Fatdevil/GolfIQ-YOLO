# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

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
   - Observability & telemetry metrics (session_count, fps_avg/p10, latency_ms_p50/p90, tracking_quality_p50, anchor_resets, thermal_warnings, fallback_events) plus log structure and trace sampling limits
   - Performance SLOs (camera fps, HUD latency, jitter, drift, thermal limits, cold start, battery budget)
   - Accessibility & safety guardrails (WCAG AA contrast, one-handed reach, font scaling, clear center FOV, periodic "Heads up" banner)
   - Privacy posture (on-device frames/location, anonymized telemetry, permission timing)
   - Testing obligations (unit/simulation/device/field coverage, golden screenshots)
   - Quality gates (>=85% coverage, lint zero errors <=5 warnings, bundle size <=20 MB growth, deterministic builds, license manifest)

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
[Describe the main user journey in plain language]

### Acceptance Scenarios
1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

### Edge Cases
- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]  
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*
- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*
- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Non-Functional Targets *(mandatory for major features)*
- **Performance & Latency**: Document how the change maintains >=30 fps camera preview (target 45), <=120 ms HUD update latency, <1.0 deg pose jitter over 3 seconds, <0.5 m drift over 30 seconds at 1.2 m/s, 15-minute thermal stability with logging, <=3.0 s cold start, and <=9% battery impact per 15-minute session at 75% brightness.
- **Accuracy & Anchoring**: Explain how distance overlays remain within 2.0 m for 30-200 m ranges, 95% anchors stay within 0.5 m after 30 seconds, and wind hints remain qualitative tiers only.
- **Reliability & Fallbacks**: Capture plans to uphold >=99.5% crash-free sessions across trailing 1,000 runs, enforce downgrade to 2D compass when tracking is poor >2 s, and preserve offline continuity plus offline badge behaviour.
- **UX & Accessibility**: Detail WCAG AA contrast at 75% brightness, one-handed reach on 6.7 inch screens, font scaling to 130% without layout issues, a clear center 8% FOV, and the periodic "Heads up" safety banner.
- **Security & Privacy**: Show how frames and location remain on-device absent consent, telemetry is anonymized without raw frames/PII, and permissions are requested only when the capability is needed.
- **Observability & Telemetry**: State the metrics, structured JSON logs (build_id, device_class), and <=10% session sampling for detailed performance traces that will cover the new work.
- **Quality Gates**: Explain how coverage stays >=85% lines in core modules, lint ends with zero errors and <=5 warnings, bundle growth stays <=20 MB per platform, builds remain deterministic with pinned toolchains, and the license manifest excludes GPL-only dependencies.
- **Testing Strategy**: Align unit, simulation, device, field, and golden screenshot coverage with constitution expectations.


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




