"""Validate plays-like literature_v1 profile against published ranges."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MPS_TO_MPH = 2.237


@dataclass
class WindAlphas:
    alphaHead_per_mph: float
    alphaTail_per_mph: float


@dataclass
class LiteratureProfile:
    model: str
    note: str
    globals: Dict[str, Any]
    byClub: Dict[str, Dict[str, float]]
    byPlayerType: Dict[str, Dict[str, float]]


@dataclass
class Scenario:
    distance: float
    delta_h: float
    w_parallel_mps: float
    club: Optional[str]
    player_type: Optional[str]
    expect_eff: Optional[Tuple[float, float]]
    expect_pct: Optional[Tuple[float, float]]


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_profile(base_path: Path) -> LiteratureProfile:
    data = load_json(base_path / "literature_v1.json")
    return LiteratureProfile(
        model=data["model"],
        note=data["note"],
        globals=data["globals"],
        byClub=data.get("byClub", {}),
        byPlayerType=data.get("byPlayerType", {}),
    )


def load_scenarios(base_path: Path) -> List[Scenario]:
    scenarios = load_json(base_path / "validation_cases.json")
    parsed: List[Scenario] = []
    for entry in scenarios:
        parsed.append(
            Scenario(
                distance=float(entry["D"]),
                delta_h=float(entry.get("deltaH", 0)),
                w_parallel_mps=float(entry.get("W_parallel_mps", 0)),
                club=entry.get("club"),
                player_type=entry.get("playerType"),
                expect_eff=tuple(entry["expectEff"]) if entry.get("expectEff") else None,
                expect_pct=tuple(entry["expectPct"]) if entry.get("expectPct") else None,
            )
        )
    return parsed


def apply_scaling(
    profile: LiteratureProfile,
    base: WindAlphas,
    club: Optional[str],
    player_type: Optional[str],
) -> WindAlphas:
    scale_head = 1.0
    scale_tail = 1.0

    if club:
        club_entry = profile.byClub.get(club, {})
        scale_head *= float(club_entry.get("scaleHead", 1.0))
        scale_tail *= float(club_entry.get("scaleTail", 1.0))

    if player_type:
        player_entry = profile.byPlayerType.get(player_type, {})
        scale_head *= float(player_entry.get("scaleHead", 1.0))
        scale_tail *= float(player_entry.get("scaleTail", 1.0))

    return WindAlphas(
        alphaHead_per_mph=base.alphaHead_per_mph * scale_head,
        alphaTail_per_mph=base.alphaTail_per_mph * scale_tail,
    )


def compute_slope_adjust(distance: float, delta_h: float, slope_factor: float) -> float:
    return delta_h * slope_factor if distance > 0 else 0.0


def compute_wind_adjust(
    distance: float,
    w_parallel_mps: float,
    alphas: WindAlphas,
    cap_pct: float,
    taper_start_mph: float,
) -> float:
    if distance <= 0 or w_parallel_mps == 0:
        return 0.0
    wind_mph = abs(w_parallel_mps) * MPS_TO_MPH
    if wind_mph == 0:
        return 0.0
    is_headwind = w_parallel_mps >= 0
    alpha = alphas.alphaHead_per_mph if is_headwind else alphas.alphaTail_per_mph
    below = min(wind_mph, taper_start_mph) * alpha
    above = max(wind_mph - taper_start_mph, 0) * alpha * 0.8
    pct = below + above
    if not is_headwind:
        pct = -pct
    capped_pct = max(min(pct, cap_pct), -cap_pct)
    return distance * capped_pct


def evaluate_scenario(profile: LiteratureProfile, scenario: Scenario) -> Dict[str, Any]:
    globals_cfg = profile.globals
    base_alphas = WindAlphas(
        alphaHead_per_mph=float(globals_cfg["alphaHead_per_mph"]),
        alphaTail_per_mph=float(globals_cfg["alphaTail_per_mph"]),
    )
    alphas = apply_scaling(profile, base_alphas, scenario.club, scenario.player_type)
    slope = compute_slope_adjust(
        scenario.distance,
        scenario.delta_h,
        float(globals_cfg.get("slopeFactor", 1.0)),
    )
    wind = compute_wind_adjust(
        scenario.distance,
        scenario.w_parallel_mps,
        alphas,
        float(globals_cfg.get("windCap_pctOfD", 0.2)),
        float(globals_cfg.get("taperStart_mph", 20)),
    )
    distance_eff = round(scenario.distance + slope + wind, 1)
    pct = (wind / scenario.distance * 100) if scenario.distance else 0.0
    pct = round(pct, 2)
    results: Dict[str, Any] = {
        "distanceEff": distance_eff,
        "windPct": pct,
        "slopeM": round(slope, 1),
        "windM": round(wind, 1),
    }
    checks: List[str] = []
    passed = True
    if scenario.expect_eff:
        lo, hi = scenario.expect_eff
        ok = lo <= distance_eff <= hi
        checks.append(f"eff in [{lo}, {hi}] -> {'PASS' if ok else 'FAIL'}")
        passed &= ok
    if scenario.expect_pct:
        lo, hi = scenario.expect_pct
        ok = lo <= pct <= hi
        checks.append(f"pct in [{lo}, {hi}] -> {'PASS' if ok else 'FAIL'}")
        passed &= ok
    results["checks"] = checks
    results["passed"] = passed
    return results


def write_report(
    report_path: Path,
    profile: LiteratureProfile,
    scenarios: List[Scenario],
    evaluations: List[Dict[str, Any]],
) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    lines = [
        "# Plays-Like Literature Profile Validation",
        "",
        f"Generated: {timestamp}",
        "",
        f"Profile note: {profile.note}",
        "",
        "| Case | D (yd) | ΔH (m) | W‖ (m/s) | Club | Player | Eff (yd) | Wind % | Checks |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for idx, (scenario, result) in enumerate(zip(scenarios, evaluations), start=1):
        checks = "<br/>".join(result["checks"]) if result["checks"] else "–"
        lines.append(
            "| {idx} | {D:.1f} | {dH:.1f} | {wind:.1f} | {club} | {player} | {eff:.1f} | {pct:.2f}% | {checks} |".format(
                idx=idx,
                D=scenario.distance,
                dH=scenario.delta_h,
                wind=scenario.w_parallel_mps,
                club=scenario.club or "–",
                player=scenario.player_type or "–",
                eff=result["distanceEff"],
                pct=result["windPct"],
                checks=checks,
            )
        )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    base_path = Path(__file__).resolve().parent
    profile = load_profile(base_path)
    scenarios = load_scenarios(base_path)
    evaluations = [evaluate_scenario(profile, scenario) for scenario in scenarios]

    all_passed = True
    print("Plays-Like literature_v1 validation")
    print("=" * 40)
    for idx, (scenario, result) in enumerate(zip(scenarios, evaluations), start=1):
        status = "PASS" if result["passed"] else "FAIL"
        all_passed &= result["passed"]
        print(
            f"Case {idx}: D={scenario.distance} ΔH={scenario.delta_h} "
            f"W‖={scenario.w_parallel_mps} club={scenario.club or '-'} "
            f"player={scenario.player_type or '-'} -> {status}"
        )
        for check in result["checks"]:
            print(f"  - {check}")
    report_path = (
        Path(__file__).resolve().parents[2]
        / "reports"
        / "playslike_literature_validation.md"
    )
    write_report(report_path, profile, scenarios, evaluations)
    print(f"Report written to {report_path}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
