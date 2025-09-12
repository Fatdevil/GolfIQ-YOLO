import json
import math
import os
import pathlib
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
xml_path = ROOT / "coverage.xml"
policy_path = ROOT / ".github/coverage-policy.json"
baseline_path = ROOT / ".github/coverage-baseline.json"


def read_total(xml_file: pathlib.Path) -> float:
    t = ET.parse(xml_file).getroot()
    line_rate = t.attrib.get("line-rate")
    if line_rate is not None:
        return round(float(line_rate) * 100.0, 2)
    cov, tot = 0.0, 0.0
    for pkg in t.iterfind(".//package"):
        cov += float(pkg.attrib.get("line-rate", "0")) * 100
        tot += 100.0
    return round(cov / tot if tot else 0.0, 2)


total = read_total(xml_path)
print(f"Total coverage: {total:.2f}%")

policy = json.loads(policy_path.read_text())
min_target = float(policy.get("min_target", 50.0))
max_drop = float(policy.get("max_drop", 0.5))

baseline = (
    json.loads(baseline_path.read_text())
    if baseline_path.exists()
    else {"total": min_target}
)
base = float(baseline.get("total", min_target))
print(f"Baseline: {base:.2f}%  (max_drop {max_drop} pp)")

mode = os.getenv("COVERAGE_MODE", "pr")
allowed = max(min_target, base - max_drop)
if mode == "pr":
    if total + 1e-6 < allowed:
        print(f"Coverage below allowed threshold {allowed:.2f}%")
        sys.exit(1)
    sys.exit(0)

if total > base + 1e-6:
    print(f"Improved baseline -> {total:.2f}%")
    baseline_path.write_text(json.dumps({"total": round(total, 2)}, indent=2))
sys.exit(0)
