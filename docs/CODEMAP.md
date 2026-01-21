# CODEMAP

## 1. Topologi & scripts

### shared/
```
shared/
├── arhud/
│   ├── bundle_client.ts
│   ├── state_machine.ts
│   ├── auto_course.ts
│   └── native/
│       ├── qa_gate.ts
│       └── heading.ts
├── caddie/
│   ├── advice.ts
│   ├── playslike.ts
│   ├── risk.ts
│   ├── strategy.ts
│   ├── selectors.ts
│   └── types.ts
├── follow/
│   ├── auto.ts
│   ├── snapshot.ts
│   ├── state.ts
│   └── types.ts
├── shotsense/
│   ├── detector.ts
│   ├── dto.ts
│   └── types.ts
├── round/
│   ├── recorder.ts
│   ├── round_store.ts
│   ├── storage.ts
│   ├── summary.ts
│   └── types.ts
├── telemetry/
│   ├── caddie.ts
│   ├── follow.ts
│   ├── round.ts
│   ├── shotsense.ts
│   └── shotsenseMetrics.ts
└── watch/
    ├── bridge.ts
    ├── codec.ts
    └── types.ts
```

### golfiq/app/src/
```
golfiq/app/src/
├── components/
│   ├── overlay/
│   ├── shotsense/
│   ├── summary/
│   └── event/
├── features/
│   ├── caddie/
│   │   ├── CaddieHudCard.tsx
│   │   └── CaddieWhySheet.tsx
│   └── follow/
├── follow/
│   ├── context.ts
│   └── useFollowLoop.ts
├── shotsense/
│   ├── AutoCaptureQueue.ts
│   └── PostHoleReconciler.ts
├── screens/
│   ├── QAArHudOverlayScreen.tsx
│   └── GoalsPanel.tsx
└── lib/
    ├── course.ts
    └── hooks/
```

### web/
```
web/
├── src/
│   ├── components/
│   ├── features/
│   │   ├── replay/
│   │   └── share/
│   ├── hooks/
│   ├── overlay/
│   ├── pages/
│   ├── types/
│   └── dev/
├── tests/
│   ├── shared/
│   └── app-utils/
└── package.json
```

### tools/
```
tools/
└── ux_preview/         # lightweight web renderer for ux_payload_v1 demos
```

### android/
```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   ├── stub/
│   │   └── test/
│   └── build.gradle.kts
├── wear/
│   ├── src/
│   │   ├── main/java/com/golfiq/wear/
│   │   │   ├── HudCodec.kt
│   │   │   └── ui/
│   └── build.gradle.kts
├── bench/
│   └── build.gradle.kts
└── settings.gradle.kts
```

### watchos/
```
watchos/
├── ContentView.swift
├── CaddieMiniCardView.swift
├── SessionDelegate.swift
├── WatchHUDModel.swift
└── WatchHUDTests/
```

### Viktiga scripts
- **golfiq/app/package.json** – Expo targets: `npm run start`, `npm run android`, `npm run ios`, `npm run web`.
- **web/package.json** – Vite targets: `npm run dev`, `npm run build`, `npm run preview`, `npm run typecheck`, `npm run test`, plus focused suites (`test:playslike`, `test:unit`).
- **android/settings.gradle.kts** – Modules `:app`, `:wear`, optional `:bench` (enabled with `INCLUDE_BENCH=true`).
- **android/app/build.gradle.kts** – Compose stub; unit tests via `./gradlew :app:testDebugUnitTest` (returns defaults per `testOptions`).
- **android/wear/build.gradle.kts** – Wear Compose app; unit tests `./gradlew :wear:testDebugUnitTest` and tiles via `androidx.wear.tiles`.
- CI docs flag Android JVM tests as flaky; prefer `./gradlew testDebugUnitTest --info` locally before promoting.

## 2. Huvudflöden

### HUD/AR
- Payload assembly happens in **golfiq/app/src/screens/QAArHudOverlayScreen.tsx** where watch payloads merge strategy, plays-like, and Caddie hints before sending through the bridge debounce (`WatchBridge.sendHUDDebounced`).
- Type discipline enforced by **shared/watch/types.ts** (`WatchHUDStateV1`, `WatchDiag`) and sanitized encode/decode in **shared/watch/codec.ts**, which clamps inputs, validates strategy profiles, and normalizes Caddie hints.
- Tournament-safe gating flows from round state (`tournamentSafe` flag) into payloads; HUD UI on watch hides strategy/Caddie surfaces when true (**watchos/ContentView.swift** conditional rendering).
- QA access to HUD is controlled via **shared/arhud/native/qa_gate.ts** (env + remote-config gating) and bundle fetchers (**shared/arhud/bundle_client.ts**) that sanitize course bundles.
- Overlay geometry normalized in **shared/overlay/transport.ts** (hash + clamp) before bridging to watch/wear experiences.

### Caddie
- Plays-like adjustments computed in **shared/caddie/playslike.ts** (wind/elevation model) and in-app loops via **golfiq/app/src/screens/QAArHudOverlayScreen.tsx** and **shared/playslike/PlaysLikeService.ts**.
- Strategy + risk mixing occurs in **shared/caddie/strategy.ts** and `strategy_profiles.ts`, with runtime overrides from RC (**shared/caddie/rc.ts**) and persona learning hooks in **shared/caddie/advice.ts**.
- View-model projection for UI lives in **shared/caddie/selectors.ts** (`selectCaddieHud` returning `CaddieHudVM`) consumed by cards (`golfiq/app/src/features/caddie/CaddieHudCard.tsx`).
- Telemetry pathways for plays-like/strategy events live in **shared/telemetry/caddie.ts**, toggled via `setEnableCaddieTelemetry`; QA screen wires emitters when telemetry is enabled.

### Follow / ShotSense
- Auto-loop state handled by **shared/follow/auto.ts** and orchestrated in React via **golfiq/app/src/follow/useFollowLoop.ts**, which emits telemetry (`shared/telemetry/follow.ts`) and snapshot payloads for watch sync.
- ShotSense detection in **shared/shotsense/detector.ts** buffers IMU/GPS frames, queues candidates, and defers confirmation.
- Post-hole reconciliation UI and logging are in **golfiq/app/src/shotsense/PostHoleReconciler.ts**, calling `RoundRecorder.addShot` and computing TP/FP/FN via **shared/telemetry/shotsenseMetrics.ts** before NDJSON export.
- Export surfaces rely on `exportHoleAccuracy()` (Shotsense metrics) and run uploader queue (**shared/runs/uploader.ts**) for HUD/round artifacts.

### Watch (Wear + watchOS)
- Shared codec/bridge (`shared/watch/codec.ts`, `shared/watch/bridge.ts`) encode payloads, debounce sends, and fan out overlay JSON (hash via `hashOverlaySnapshot`).
- Android Wear stack: `HudCodec.kt` mirrors the TS codec; UI renders via `ui/HudScreen.kt` (Compose) and `HudViewModel.kt` streams `HudStateRepository` + `OverlayRepository`. Tiles transport sits in `overlay/WearConnector.kt` and `WearOverlayRenderer.kt`.
- watchOS app binds `WatchHUDModel` to `ContentView.swift`; `SessionDelegate.swift` handles `WCSession` activation, context replay, and toast messaging on `roundSaved` events.
- Codec consistency validated by tests in `android/wear/src/test/...` and `watchos/WatchHUDTests`.

## 3. Nyckeltyper & gränssnitt

```ts
// shared/watch/types.ts
export type WatchHUDStateV1 = {
  v: 1;
  ts: number;
  fmb: { front: number; middle: number; back: number };
  playsLikePct: number;
  wind: { mps: number; deg: number };
  strategy?: { profile: 'conservative' | 'neutral' | 'aggressive'; offset_m: number; carry_m: number };
  tournamentSafe: boolean;
  caddie?: {
    club: string;
    carry_m: number;
    total_m?: number | null;
    aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
    risk: 'safe' | 'neutral' | 'aggressive';
    confidence?: number | null;
  };
};

// shared/caddie/selectors.ts
export type CaddieHudVM = {
  best: {
    clubId: string;
    carry_m: number;
    total_m?: number | null;
    aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
    risk: 'safe' | 'neutral' | 'aggressive';
    confidence?: number | null;
  };
  candidates?: Array<{
    risk: 'safe' | 'neutral' | 'aggressive';
    clubId: string;
    carry_m: number;
    sigma_m?: number | null;
    confidence?: number | null;
    aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
  }>;
  context?: {
    wind_mps?: number;
    elevation_m?: number;
    temp_c?: number;
    hazardLeft?: number;
    hazardRight?: number;
  };
};

// shared/round/types.ts
export interface ShotEvent {
  id: string;
  hole: number;
  seq: number;
  club?: string;
  start: { lat: number; lon: number; ts: number };
  end?: { lat: number; lon: number; ts: number };
  startLie: 'Tee' | 'Fairway' | 'Rough' | 'Sand' | 'Recovery' | 'Green' | 'Penalty';
  endLie?: ShotEvent['startLie'];
  carry_m?: number;
  toPinStart_m?: number;
  toPinEnd_m?: number;
  sg?: number;
  playsLikePct?: number;
  kind: 'Full' | 'Chip' | 'Pitch' | 'Putt' | 'Recovery' | 'Penalty';
}

export type RoundState = {
  id: string;
  courseId: string;
  startedAt: number;
  finishedAt?: number;
  holes: Record<number, HoleState>;
  currentHole: number;
  tournamentSafe: boolean;
};
```

## 4. Hotspots & risk
- `.github/coverage-baseline.json` – churn driver (102 touches) for coverage gating; treat updates cautiously.
- `golfiq/app/src/screens/QAArHudOverlayScreen.tsx` – QA hub for HUD, watch sync, Caddie tuning; complex dependencies, high bug risk.
- `README.md` – product narrative changes (44 edits) indicate evolving onboarding.
- `server/app.py`, `server/api/main.py`, `server/routes/cv_analyze_video.py` – backend entrypoints for CV uploads; coordinate changes with telemetry contracts.
- `.github/workflows/ci.yml` – pipeline toggles; interacts with flaky Android JVM + watch permissions/tiles jobs.
- `web/vitest.config.ts`, `web/src/api.ts` – front-end API/test harness hotspots.
- `.gitignore` – ensure data artifacts tracked/excluded appropriately.
- Reconfirm Android JVM unit tests and Wear tile permission suites are flaky in CI; rerun locally with `./gradlew testDebugUnitTest` and targeted Wear tile tests before merging.

## 5. Hook-punkter för nästa steg

### Post-Hole Reconcile + TP/FP/FN-telemetri
- UI trigger: `useFollowLoop` calls `PostHoleReconciler.reviewAndApply()` when auto-advance hits new holes; QA screen exposes manual reconcile.
- Recorder updates: `PostHoleReconciler` funnels accepted auto shots into `RoundRecorder.addShot` and references `RoundRecorder.getHoleShots` for accuracy snapshots.
- Telemetry: `appendHoleAccuracy` + `computeConfusion` in **shared/telemetry/shotsenseMetrics.ts** maintain NDJSON export; extend here for TP/FP/FN streaming.
- Hook suggestion: add reconciliation status banner in QA HUD screen (same module) and emit `round.auto.advance.v1` annotations when auto shots applied.

### Risk-bias threading into Caddie/GreenIQ
- Risk ceilings sourced in **shared/caddie/rc.ts** (`riskMax`, feature toggles). Strategy bias flows through **shared/caddie/strategy_profiles.ts** and `advice.ts` persona overrides.
- GreenIQ adjustments live in **shared/greeniq/** (e.g. `break.ts`, `stimp.ts`) and feed into Caddie plan heuristics via QA screen selectors.
- Hook suggestion: introduce risk bias DTO (e.g. `{ profile: RiskProfile; bias: number }`) surfaced through `CaddieHudVM.context` and mirrored in watch payload (`WatchHUDStateV1.strategy`), guarding behind RC.

### Cloud Sync v1 (read-only plan)
- Local persistence: `RoundRecorder` + `shared/round/storage.ts` (AsyncStorage schema `round.engine.v1`).
- Upload queue: **shared/runs/uploader.ts** handles HUD/round payload retries with API base/key negotiation (`resolveRunsApiConfig`).
- DTO candidates: leverage `RoundState` + `ShotEvent` (see §3) and `UploadTask` envelope (`RunUploadKind = 'hud' | 'round'`). Tables needed: `rounds`, `round_shots`, `hud_snapshots`, `upload_queue` with TTL/backoff metadata.
- Hook suggestion: add cloud mirror service that listens to `RoundRecorder.subscribe` and enqueues run snapshots via `enqueueUpload` (existing uploader), keeping sync read-only until server contracts finalize.
