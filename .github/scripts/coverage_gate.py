#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def read_pct(xml_path="coverage.xml"):
    root = ET.parse(xml_path).getroot()
    lr = root.get("line-rate")
    if lr is not None:
        return round(float(lr) * 100.0, 2)
    lines_valid = int(root.get("lines-valid", 0))
    lines_covered = int(root.get("lines-covered", 0))
    return round(100.0 * lines_covered / max(1, lines_valid), 2)


def fetch_baseline():
    try:
        subprocess.run(["git", "fetch", "origin", "main", "--depth", "1"], check=True)
        blob = subprocess.check_output(
            ["git", "show", "origin/main:.github/coverage-baseline.json"], text=True
        )
        return json.loads(blob)["coverage"]
    except Exception:
        return None


def write_baseline(pct, path=".github/coverage-baseline.json"):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps({"coverage": pct}, indent=2))


def color_for(pct):
    if pct < 50:
        return "red"
    if pct < 70:
        return "yellow"
    if pct < 85:
        return "yellowgreen"
    return "brightgreen"


def update_badge(pct, readme="README.md"):
    p = Path(readme)
    if not p.exists():
        p.write_text("")
    text = p.read_text()
    start = "<!--COVERAGE_BADGE_START-->"
    end = "<!--COVERAGE_BADGE_END-->"
    badge = (
        f"{start}![coverage](https://img.shields.io/badge/coverage-"
        f"{int(round(pct))}%25-{color_for(pct)}){end}"
    )
    new = (
        re.sub(f"{re.escape(start)}.*?{re.escape(end)}", badge, text, flags=re.S)
        if (start in text and end in text)
        else badge + "\n\n" + text
    )
    p.write_text(new)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "mode",
        choices=["pr", "update"],
        help="pr: check vs baseline; update: write baseline+badge on main",
    )
    ap.add_argument("--xml", default="coverage.xml")
    ap.add_argument("--tolerance", type=float, default=0.25)
    args = ap.parse_args()

    pct = read_pct(args.xml)
    print(f"Total coverage: {pct}")

    if args.mode == "pr":
        baseline = fetch_baseline()
        if baseline is None:
            print("No baseline on main yet; allowing current PR coverage.")
            sys.exit(0)
        allowed = max(0.0, baseline - args.tolerance)
        print(f"Baseline: {baseline}  Allowed≥ {allowed}")
        if pct + 1e-6 < allowed:
            print("Coverage below allowed threshold")
            sys.exit(1)
        sys.exit(0)

    write_baseline(pct)
    update_badge(pct)


if __name__ == "__main__":
    main()
