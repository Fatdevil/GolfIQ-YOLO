# Coach Learning Loop v1

The coach learning loop captures lightweight practice and round outcomes to adapt focus rankings,
risk guidance, and advice tone. The implementation intentionally keeps the model simple (EMA updates)
so that future ML models can slot into the same `PlayerProfile` and `CoachPolicy` interfaces.

## What is stored locally?

* `PlayerProfile` lives under the storage key `coach.profile.v1` and contains:
  * Relative focus weights for each training segment.
  * Rolling adherence and adoption scores.
  * Rolling strokes-gained lifts per focus.
  * Risk preference and advice tone/verbosity hints.
* Opt-in status for coach learning is stored separately under `privacy.coachLearning.optIn` (with a
  legacy read of `coach.profile.privacy` for older builds).
* Persistence uses `shared/core/pstore.ts` which dynamically selects AsyncStorage (React Native),
  falling back to `localStorage` or in-memory storage on the web/Node.

Resetting the coach from **About → Diagnostics** clears the persisted profile and resets EMA state.

## Remote config gates

| RC key | Default | Purpose |
| --- | --- | --- |
| `coach.learning.enabled` | `true` | Enables profile-driven plan suggestions and advice style updates. |
| `coach.sync.enabled` | `false` | Opt-in feature flag that allows the app to POST/GET the profile via `/coach/profile`. |
| `coach.decay.halfLifeDays` | `14` | Half-life in days used when decaying focus weights and rolling metrics. |

The optional server endpoint stores profiles by device ID only when both the RC flag and the user
opt-in are true. QA tests interact with the in-memory FastAPI store located in
`server/routes/coach_profile.py`.

## How the policy works

`CoachPolicy` is a set of pure functions:

* `rankFocus(profile)` weighs the stored focus weights, recent SG deficits, and adherence penalties to
  recommend a focus ordering. The scheduler calls this when suggesting a plan for users who haven’t
  manually picked a focus.
* `pickAdviceStyle(profile)` mirrors the tone and verbosity stored in the profile. HUD style settings
  adopt these hints so text/voice output stays consistent with learning feedback.
* `pickRisk(profile, holeCtx)` biases toward safe risk when adoption is low or hazards are dense, and
  allows normal/aggressive guidance once SG lifts and adherence trend positively.

`shared/caddie/advice.ts` passes the active profile through the policy so the advice engine respects
style/verbosity hints and risk overrides whenever the effective learning gate is active.

## Privacy & gate semantics

The effective gate for all learning behaviour is `rc.coach.learningEnabled && userOptIn`.

* When the gate is **off**, the app does not read, write, or mutate the persisted coach profile. HUD
  advice falls back to the default tone/verbosity and baseline risk, and the training scheduler uses
  the RC default or any manual focus the golfer selects.
* When the gate is **on**, profile updates, CoachPolicy ranking, and advice style/risk customisation
  are enabled. Remote sync still requires `coach.sync.enabled` in addition to the user opt-in.

## Metrics and telemetry

* Every profile mutation emits a `coach.profile.updated` telemetry event containing the delta in
  weights as well as risk/style changes. The event also mirrors the current SG lift per focus to
  support server-side aggregation.
* `/caddie/health` now reports two learning metrics:
  * `coach_weight_delta` – average absolute change in focus weights across recent updates.
  * `sg_lift_by_focus` – mean strokes-gained lift per focus over the same window.

These metrics surface in the QA digest so we can monitor whether the learning loop is stabilising
focus recommendations and delivering measurable lift.

## Privacy and opt-in

The privacy toggle lives in **About → Diagnostics**. When disabled we keep the existing profile
local but skip telemetry and sync. Resetting the coach clears the local store and drops all rolling
history. Opting back in restarts the EMA loop from default weights.
