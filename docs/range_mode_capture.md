# Range Mode Capture Guide

Range Mode is optimized for reliable ball tracking on mobile cameras. Follow this guide to standardize capture conditions and reduce tracking errors.

## Camera placement
- **Behind the player (recommended):** 10–15 ft (3–5 m) behind the golfer, centered on the target line.
- **Side view (acceptable):** 8–12 ft (2.5–3.5 m) off the player’s lead side, aimed at the hitting area.
- **Height:** Keep the lens at waist-to-chest height to keep the ball flight and club path in frame.
- **Framing:** Include the ball, club, and a few yards of initial flight.

## Lighting guidance
- Favor bright, even lighting (outdoor range or well-lit indoor bay).
- Avoid backlighting or direct sun into the lens.
- If indoors, point lighting toward the hitting area and avoid flicker.

## Background guidance
- Use a clean background with minimal movement.
- Avoid busy nets, crowds, or rapidly moving objects behind the ball.

## Recommended capture settings
- **FPS:** 240 preferred, 120 minimum (slow-motion mode).
- **Exposure:** Lock exposure/shutter if possible; avoid HDR auto-exposure swings.
- **Resolution:** 1080p+ recommended (720 minimum).
- **Stabilization:** Use a tripod whenever possible.

## Quick checklist (5–7 items)
1. Phone is stable on a tripod or solid surface.
2. 120+ FPS enabled (slow-motion mode), 240 if available.
3. 1080p resolution selected.
4. Bright, even lighting on the hitting area.
5. Exposure locked; avoid HDR and aggressive auto-exposure changes.
6. Clean background with minimal motion.
7. Ball and club stay in frame through impact.
8. Camera is aligned with the target line.

## Capture quality score (Range Mode)
Range Mode produces a deterministic capture quality score and flags that help filter unusable clips.

- **Score:** 0.0–1.0 where 1.0 indicates all guardrails met.
- **Flags:** Deterministic heuristics based on FPS, exposure/blur, and framing.
- **Recommendations:** Short user-facing tips tied to each flag.

## Range Mode flags → Tips mapping
- **fps_low** → Record in slow-motion mode (120+ FPS minimum, 240 FPS ideal).
- **blur_high** → Use faster shutter/lock exposure and stabilize the phone.
- **exposure_too_dark** → Increase lighting or move to a brighter area.
- **exposure_too_bright** → Reduce exposure or avoid harsh direct light.
- **framing_unstable** → Keep the ball centered with extra margin.
- **ball_lost_early** → Start recording earlier and keep the ball in frame longer.

## How flags are determined (high level)
- **fps_low:** Effective FPS from timestamps (if available) or configured FPS below 120.
- **blur_high:** Sustained low edge sharpness from Laplacian variance (numpy only).
- **exposure flags:** Sustained dark/bright mean luminance vs thresholds.
- **framing_unstable:** Ball track spends too many frames near the edge margin.
- **ball_lost_early:** Track length too short or first detection arrives too late.
