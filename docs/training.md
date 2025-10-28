# Training Focus Framework v1

GolfIQ now supports lightweight training packs that define drills, multi-day plans, and optional coach personas. Packs live under `data/training/packs/*.json` and power QA workflows, the HUD goals panel, and SG-by-focus telemetry.

## Taxonomy & Types

Training focus keys are shared across the stack:

```
long-drive | tee | approach | wedge | short | putt | recovery
```

The runtime types are defined in [`shared/training/types.ts`](../shared/training/types.ts):

- `TrainingPack` bundles drills, plans, and an optional `CoachPersona`.
- `Drill` captures the target metric, estimated time, difficulty, and prerequisites.
- `Plan` lists ordered drill references, schedule hints, and total time.

## Content Loader

Use [`shared/training/content_loader.ts`](../shared/training/content_loader.ts) to read packs:

```ts
import { loadTrainingPacks, getPlansByFocus } from '../../shared/training/content_loader';

await loadTrainingPacks();
const puttingPlans = getPlansByFocus('putt');
```

The loader recursively reads `TRAINING_PACKS_DIR` (defaults to `data/training`), validates pack shape, caches the parsed objects, and exposes `getPlansByFocus` / `getDrillsByFocus`. Tests cover sorting, schema validation, and focus filters.

## Schema Validation

CI runs [`server/scripts/validate_training_packs.py`](../server/scripts/validate_training_packs.py) via the `training-pack-validate` workflow. The script enforces:

- required fields (`packId`, `version`, `drills`, `plans`),
- tight schemas for drills, plans, personas, and target metrics,
- max file size (50 KB),
- duplicate drill/plan ID detection, and
- plan drill references pointing to declared drills.

Run locally:

```bash
python server/scripts/validate_training_packs.py --base data/training/packs
```

## Goals Panel & Practice Sessions

`GoalsPanel` in the QA app now surfaces a focus selector, recommended plans, and a “Starta program” button that builds a practice session via [`sessionFactory.ts`](../golfiq/app/src/screens/Practice/sessionFactory.ts). Practice sessions snapshot the selected plan, focus, and drill metadata for downstream tooling.

## SG by Focus & Health API

The SG engine resolves each shot to a training focus segment. `/caddie/health` aggregates adoption and SG lift per focus, returning:

- `sg_gained_per_round_by_focus`: per-focus sample/mean/median, and
- `adoption_by_focus`: plan counts and adoption rates.

This mirrors the existing A/B health model so dashboards can compare focus cohorts alongside rollout groups.


## Available packs (v1)
- putting_v1 — Lag pace 9 m, Startline 2 m (gate). Plan: “Putting – Week 1”.
- long_drive_v1 — Tee height A/B, 80% tempo. Plan: “Long-Drive – Week 1”.
