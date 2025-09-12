import json
import os
import pathlib
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
xml_path = ROOT / "coverage.xml"
policy_path = ROOT / ".github/coverage-policy.json"
base_path = ROOT / ".github/coverage-baseline.json"


def read_total(p: pathlib.Path) -> float:
    if not p.exists():
        print("coverage.xml not found")
        return -1.0
    t = ET.parse(p).getroot()
    lr = t.attrib.get("line-rate")
    if lr is not None:
        return round(float(lr) * 100.0, 2)
    # fallback: summera
    covered = valid = 0
    for c in t.iterfind(".//class"):
        covered += int(c.attrib.get("lines-covered", "0") or 0)
        valid += int(c.attrib.get("lines-valid", "0") or 0)
    return round((covered / valid * 100.0) if valid else 0.0, 2)


total = read_total(xml_path)
if total < 0:
    print("Coverage report missing (treat as 0%).")
    total = 0.0
print(f"Total coverage: {total:.2f}%")

policy = (
    json.loads(policy_path.read_text())
    if policy_path.exists()
    else {"min_target": 50.0, "max_drop": 0.5}
)
min_target = float(policy.get("min_target", 50.0))
max_drop = float(policy.get("max_drop", 0.5))
base = (
    float(json.loads(base_path.read_text()).get("total", min_target))
    if base_path.exists()
    else min_target
)
allowed = max(min_target, base - max_drop)
print(f"Baseline: {base:.2f}  Allowed≥ {allowed:.2f}")

mode = os.getenv("COVERAGE_MODE", "pr")
eps = 0.01
if mode == "pr":
    if total + eps < allowed:
        print("Coverage below allowed threshold")
        sys.exit(1)
    sys.exit(0)
# main-branch: uppdatera baseline om förbättrat
if total > base + eps:
    base_path.write_text(json.dumps({"total": round(total, 2)}, indent=2))
    print(f"Baseline improved -> {total:.2f}")
sys.exit(0)
