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

## Launch Content Packs

Two starter packs ship with the v1 catalog:

- **Putting v1** – concise green-side persona plus two drills focused on pace control and start line, bundled in the `putt-week-1` plan (18 minuter / 2x vecka).
- **Long-Drive v1** – pep persona for tee shots with tee-height A/B and tempo drills, grouped in `ld-week-1` (22 minuter / 2x vecka).

The catalog is generated from `data/training/packs/*.json` via [`scripts/build_training_catalog.py`](../scripts/build_training_catalog.py).

## Content Loader

Use [`shared/training/content_loader.ts`](../shared/training/content_loader.ts) to read packs:

```ts
import { loadTrainingPacks, getPlansByFocus } from '../../shared/training/content_loader';

await loadTrainingPacks();
const puttingPlans = getPlansByFocus('putt');
```

The loader recursively reads `TRAINING_PACKS_DIR` (defaults to `data/training`), validates pack shape, caches the parsed objects, and exposes `getPlansByFocus` / `getDrillsByFocus`. Tests cover sorting, schema validation, and focus filters.

## Schema Validation

CI runs [`server/scripts/validate_training_packs.py`](../server/scripts/validate_training_packs.py) via the `training-pack-validate` workflow. The validator now checks:

- required fields (`packId`, `version`, `drills`, `plans`),
- semantic (`1.2.3`) or YYYY.MM version strings,
- file size budget (< 50 KB per pack),
- focus + targetMetric segments constrained to the shared taxonomy,
- duplicate pack/drill/plan IDs across every pack, and
- plan drill references pointing to declared drills.

Rebuild the catalog & run validation locally:

```bash
python scripts/build_training_catalog.py --packs-dir data/training/packs --out data/training/catalog.json --version 1.0.0
python server/scripts/validate_training_packs.py --packs-dir data/training/packs --catalog data/training/catalog.json
```

Add `--pretty` to the catalog builder for an indented diff while iterating locally.

## Goals Panel & Practice Sessions

`GoalsPanel` in the QA app now surfaces a focus selector, recommended plans, and a “Starta program” button that builds a practice session via [`sessionFactory.ts`](../golfiq/app/src/screens/Practice/sessionFactory.ts). Practice sessions snapshot the selected plan, focus, and drill metadata for downstream tooling.

## SG by Focus & Health API

The SG engine resolves each shot to a training focus segment. `/caddie/health` aggregates adoption and SG lift per focus, returning:

- `sg_gained_per_round_by_focus`: per-focus sample/mean/median, and
- `adoption_by_focus`: plan counts and adoption rates.

This mirrors the existing A/B health model so dashboards can compare focus cohorts alongside rollout groups.

