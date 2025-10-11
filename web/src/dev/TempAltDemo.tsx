import { mergePlaysLikeCfg } from "@shared/playslike/PlaysLikeService";
import PlaysLikePanel from "../components/PlaysLikePanel";

const demoCfg = mergePlaysLikeCfg();

export function TempAltDemo() {
  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Temperature &amp; Altitude demo</h1>
        <p className="text-sm text-slate-400">
          QA drawer shows capped temperature/altitude components. Toggle the drawer to view the new chips.
        </p>
        <PlaysLikePanel
          enabled
          distanceMeters={150}
          deltaHMeters={5}
          windParallel={1.2}
          cfg={demoCfg}
          tempAlt={{
            enable: true,
            temperature: { value: 10, unit: "C" },
            altitudeASL: { value: 1000, unit: "ft" },
            betaPerC: 0.0018,
            gammaPer100m: 0.0065,
            caps: { perComponent: 0.1, total: 0.2 },
          }}
        />
      </div>
    </div>
  );
}
