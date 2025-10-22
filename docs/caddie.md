# AI Caddie MVP

The QA AR HUD overlay now includes a deterministic “Caddie” assistant that recommends tee and approach strategies based on the player’s bag, dispersion model, and the loaded course bundle.

## Components

- **Player model** – Converts the user bag and optional dispersion overrides into carry distances and 1σ ellipses per club. Personalised inputs toggle the TUNED badge in the UI.
- **Risk engine** – Samples dispersion ellipses against course hazards (bunkers, water, generic hazards) and estimates overlap plus an out-of-fairway penalty. Crosswind drift uses the same heuristic gain as the ghost trajectory model.
- **Strategy layer** – Builds candidate landings every ~10 m along the tee-to-pin baseline, scales ellipses by risk mode (safe/normal/aggressive), and penalises unplayable next shots. Approach planning biases to the fat side of the green when hazards pinch the target.
- **Text narration** – Generates deterministic Swedish/English hybrid lines (mode summary, wind callout, tuning status, reason) so QA can verify strings without an LLM.
- **HUD wiring** – Caddie panel exposes a risk “slider”, optional “Go for green” toggle on long holes, and an “Apply to HUD” action that seeds the planner range/aim.

## Risk modes

| Mode       | Multiplier | Behaviour |
|------------|------------|-----------|
| `safe`     | 1.2× σ     | Larger ellipses, favours fairway width and conservative next-shot distances |
| `normal`   | 1.0× σ     | Balanced dispersion, current default |
| `aggressive` | 0.8× σ   | Tighter ellipse, allows longer carries if total risk < ~0.6 |

## Limitations

- Uses coarse GeoJSON polygons; no elevation or lie modelling yet.
- Tee-vs-approach classification is distance driven and may mis-label unusual holes.
- Wind heuristics only apply lateral drift; no dynamic club selection beyond carry matching.
- Out-of-bounds and rough are approximated via absence of fairway polygons.

## Roadmap

1. Monte-Carlo strokes-gained simulator with per-shot random sampling.
2. Integrate green complexes (front/middle/back) to refine approach bail-outs.
3. Persist shot outcomes to refine player dispersion (per-club sigma updates).
4. Surface “what-if” comparisons (risk deltas between clubs) and suggest layups automatically.

## Dispersion learner (σ per club)

- **Learn** – The QA HUD can ingest the `hud_run.json` shot log and estimate per-club dispersion using `learnDispersion`. Only shots with a recorded pin and landing contribute. Longitudinal error is computed as `carry - planned_range`; lateral error comes from the signed offset against the aim heading. Median/MAD filtering drops |z| > 2.5 outliers before taking the population standard deviation.
- **Persist** – Learned sigmas are cached in AsyncStorage (`caddie.dispersion.v1`) alongside a timestamp. The in-memory cache powers both deterministic advice strings and Monte Carlo sampling without blocking the UI.
- **Apply** – When the dispersion table is saved, the player model merges the learned entries (minimum six kept samples) and toggles the TUNED badge. Clubs without enough valid shots fall back to the default fractions.

## Coach Style

The QA HUD exposes a small “coach style” model that controls the tone and verbosity of the generated tips without changing the underlying strategy. A style consists of:

- **Tone** – `concise`, `neutral`, or `pep`.
- **Verbosity** – `short`, `normal`, or `detailed`.
- **Language** – `sv` (default) or `en`.
- **Format** – `text` today (reserved `tts` for future audio output).
- **Emoji** – optional pep-only embellishment when the style format is text.

The default style is neutral/normal Swedish text without emoji. Switching style updates only the rendered narration; club selection, risk scoring, and trajectory planning remain unchanged and continue to follow the deterministic QA plan output.
