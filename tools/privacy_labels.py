#!/usr/bin/env python3
"""Generate store privacy label JSON artifacts from stability-analytics.md."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "stability-analytics.md"
DIST = ROOT / "dist"


def read_doc() -> str:
  if not DOC_PATH.exists():
    raise FileNotFoundError(f"Source document not found: {DOC_PATH}")
  return DOC_PATH.read_text(encoding="utf-8")


def extract_flag_default(text: str, flag: str) -> bool:
  pattern = re.compile(rf"\|\s*`{re.escape(flag)}`\s*\|[^|]*\|\s*`(true|false)`\s*\|", re.IGNORECASE)
  match = pattern.search(text)
  if not match:
    raise ValueError(f"Unable to locate default value for flag `{flag}` in {DOC_PATH}")
  return match.group(1).lower() == "true"


def extract_section_lines(text: str, heading: str) -> List[str]:
  pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.MULTILINE)
  match = pattern.search(text)
  if not match:
    return []
  start = match.end()
  next_heading = re.compile(r"^##\s+", re.MULTILINE)
  next_match = next_heading.search(text, pos=start)
  section = text[start: next_match.start() if next_match else len(text)]
  lines = [line.strip(" *") for line in section.splitlines() if line.strip().startswith("*")]
  return [line.strip() for line in lines]


def extract_table_rows(text: str, heading: str) -> List[Dict[str, str]]:
  pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.MULTILINE)
  match = pattern.search(text)
  if not match:
    return []
  start = match.end()
  next_heading = re.compile(r"^##\s+", re.MULTILINE)
  next_match = next_heading.search(text, pos=start)
  section = text[start: next_match.start() if next_match else len(text)]
  table_lines = [line.strip() for line in section.splitlines() if line.strip().startswith("|")]
  if len(table_lines) < 2:
    return []
  headers = [cell.strip() for cell in table_lines[0].strip("|").split("|")]
  rows: List[Dict[str, str]] = []
  for raw in table_lines[2:]:
    cells = [cell.strip() for cell in raw.strip("|").split("|")]
    if len(cells) != len(headers):
      continue
    row = {headers[i].lower(): cells[i].strip("`") for i in range(len(headers))}
    rows.append(row)
  return rows


def extract_sample_payload(text: str) -> str:
  pattern = re.compile(r"`\{[^`]+app_crash[^`]+\}`")
  match = pattern.search(text)
  if not match:
    return ""
  snippet = match.group(0).strip("`").replace("\n", " ")
  return snippet


def build_payload() -> Dict[str, Dict]:
  doc_text = read_doc()
  analytics_default = extract_flag_default(doc_text, "analyticsEnabled")
  crash_default = extract_flag_default(doc_text, "crashEnabled")
  scrubbing_rules = extract_section_lines(doc_text, "Privacy Scrubbing Rules")
  dsn_rows = extract_table_rows(doc_text, "Environment Variables / DSNs")
  sample_payload = extract_sample_payload(doc_text)

  activation_controls = [
    "Remote config flags analyticsEnabled and crashEnabled default to false and must be explicitly set to true.",
    "Sentry DSNs are required; without `SENTRY_DSN_MOBILE` or `VITE_SENTRY_DSN` the SDKs do not initialise.",
    "Web clients also honour a runtime kill switch via window.__analyticsEnabled.",
  ]

  telemetry_notes = (
    "Crash handlers emit a minimal `app_crash` marker with platform, sampling flag, timestamp, and thermal/battery hints; "
    "Sentry traces sample at 20%."
  )

  apple_payload = {
    "source": str(DOC_PATH.relative_to(ROOT)),
    "defaults": {
      "analytics_enabled": analytics_default,
      "crash_reporting_enabled": crash_default,
    },
    "activation_controls": activation_controls,
    "data_types": [
      {
        "category": "Diagnostics",
        "type": "Crash Data",
        "collected": "conditional",
        "linked_to_user": False,
        "used_for_tracking": False,
        "retention": "transient telemetry marker",
        "notes": sample_payload or telemetry_notes,
      },
      {
        "category": "Diagnostics",
        "type": "Performance Data",
        "collected": "conditional",
        "linked_to_user": False,
        "used_for_tracking": False,
        "retention": "sampled traces at 20% when enabled",
        "notes": "Includes optional analytics breadcrumbs and performance traces when analyticsEnabled is true.",
      },
    ],
    "scrubbing": scrubbing_rules,
    "sampling": {
      "traces_sample_rate": 0.2,
      "crashes_captured": "always when crashEnabled is true",
    },
    "dsns": dsn_rows,
  }

  play_payload = {
    "source": str(DOC_PATH.relative_to(ROOT)),
    "collection": {
      "analytics": {
        "default_enabled": analytics_default,
        "optional": True,
        "activation_controls": activation_controls,
        "data_usage": [
          "Performance diagnostics sampled at 20% when analyticsEnabled is true.",
        ],
      },
      "crash_reporting": {
        "default_enabled": crash_default,
        "optional": True,
        "data_usage": [
          sample_payload or telemetry_notes,
        ],
      },
    },
    "scrubbing": scrubbing_rules,
    "environment": {
      "remote_config_flags": ["analyticsEnabled", "crashEnabled"],
      "dsns": dsn_rows,
      "runtime_kill_switch": "window.__analyticsEnabled",
    },
  }

  return {
    "apple": apple_payload,
    "play": play_payload,
  }


def write_output():
  payload = build_payload()
  DIST.mkdir(parents=True, exist_ok=True)
  apple_path = DIST / "apple_privacy.json"
  play_path = DIST / "play_datasafety.json"
  apple_path.write_text(json.dumps(payload["apple"], indent=2) + "\n", encoding="utf-8")
  play_path.write_text(json.dumps(payload["play"], indent=2) + "\n", encoding="utf-8")
  print(f"[store:privacy] Wrote {apple_path} and {play_path}")


if __name__ == "__main__":
  write_output()
