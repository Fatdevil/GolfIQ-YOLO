#!/usr/bin/env python3
"""Generate release notes for Back-view v1.2 – AR-HUD MVP."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import requests

RELEASE_VERSION = "v1.2"
RELEASE_TITLE = "Back-view v1.2 – AR-HUD MVP"
HIGHLIGHTS = [
    "AR-HUD MVP (Aim→Calibrate, Re-center, F/C/B overlay)",
    "Course bundle API (ETag/TTL)",
    "Mobile thermal/battery fallback",
    "Export traced video",
    "OTel spans + golden-regression",
]
SUPPORTED_TYPES = ["feat", "fix", "docs", "ops", "test"]
TYPE_ALIASES = {
    "feature": "feat",
    "features": "feat",
    "bug": "fix",
    "bugfix": "fix",
    "doc": "docs",
    "documentation": "docs",
    "chore": "ops",
    "ci": "ops",
    "build": "ops",
    "refactor": "ops",
    "perf": "ops",
    "style": "ops",
    "ops": "ops",
    "release": "ops",
    "test": "test",
    "tests": "test",
}
PR_PATTERN = re.compile(r"#(\d+)")


@dataclass
class PullRequest:
    number: int
    title: str
    url: str
    author: str
    merged_at: Optional[str]
    pr_type: str


class CommandError(RuntimeError):
    pass


def run_git(*args: str, cwd: Optional[Path] = None) -> str:
    try:
        result = subprocess.check_output(["git", *args], cwd=cwd, text=True)
    except subprocess.CalledProcessError as exc:  # pragma: no cover - runtime guard
        raise CommandError(f"git {' '.join(args)} failed: {exc}") from exc
    return result.strip()


def detect_repo() -> str:
    repo = os.environ.get("GITHUB_REPOSITORY")
    if repo:
        return repo
    url = run_git("config", "--get", "remote.origin.url")
    if url.endswith(".git"):
        url = url[:-4]
    if url.startswith("git@"):
        _, path = url.split(":", 1)
    else:
        path = url.split("github.com/")[-1]
    return path


def determine_token() -> Optional[str]:
    for key in ("GITHUB_TOKEN", "GH_TOKEN", "CODEX_PAT", "PERSONAL_ACCESS_TOKEN"):
        token = os.environ.get(key)
        if token:
            return token
    return None


def get_last_tag(repo_root: Path) -> Optional[str]:
    try:
        return run_git("describe", "--tags", "--abbrev=0", cwd=repo_root)
    except CommandError:
        return None


def extract_pr_numbers(repo_root: Path, last_tag: Optional[str]) -> List[int]:
    range_spec = "HEAD" if not last_tag else f"{last_tag}..HEAD"
    log_output = run_git("log", range_spec, "--pretty=%s%n%b", cwd=repo_root)
    seen = set()
    ordered: List[int] = []
    for line in log_output.splitlines():
        for match in PR_PATTERN.finditer(line):
            pr_number = int(match.group(1))
            if pr_number not in seen:
                seen.add(pr_number)
                ordered.append(pr_number)
    return ordered


def fetch_pr(repo: str, token: Optional[str], number: int) -> Optional[PullRequest]:
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"https://api.github.com/repos/{repo}/pulls/{number}"
    response = requests.get(url, headers=headers, timeout=30)
    if response.status_code != 200:
        print(
            f"warning: unable to fetch PR #{number} (status={response.status_code})",
            file=sys.stderr,
        )
        return None
    data = response.json()
    title = data.get("title", f"PR #{number}")
    html_url = data.get("html_url", url.replace("api.github.com/repos", "github.com"))
    user = data.get("user") or {}
    author = user.get("login", "unknown")
    merged_at = data.get("merged_at")
    pr_type = normalize_type(title)
    return PullRequest(
        number=number,
        title=title,
        url=html_url,
        author=author,
        merged_at=merged_at,
        pr_type=pr_type,
    )


def normalize_type(title: str) -> str:
    prefix = title.split(":", 1)[0].strip().lower()
    match = re.match(r"([a-z]+)", prefix)
    if match:
        prefix = match.group(1)
    normalized = TYPE_ALIASES.get(prefix, prefix)
    if normalized in SUPPORTED_TYPES:
        return normalized
    return "ops"


def group_prs(prs: Iterable[PullRequest]) -> Dict[str, List[PullRequest]]:
    grouped: Dict[str, List[PullRequest]] = {t: [] for t in SUPPORTED_TYPES}
    for pr in prs:
        grouped.setdefault(pr.pr_type, []).append(pr)
    for pr_list in grouped.values():
        pr_list.sort(key=lambda pr: pr.number)
    return grouped


def build_release_notes(
    last_tag: Optional[str],
    grouped: Dict[str, List[PullRequest]],
    contributors: List[str],
) -> str:
    lines: List[str] = []
    lines.append(f"# {RELEASE_TITLE}")
    lines.append("")
    lines.append("## Highlights")
    for highlight in HIGHLIGHTS:
        lines.append(f"- {highlight}")
    lines.append("")
    lines.append("## Summary")
    for pr_type in SUPPORTED_TYPES:
        items = grouped.get(pr_type, [])
        if not items:
            continue
        lines.append(f"### {pr_type.title()}")
        for pr in items:
            lines.append(f"- {pr.title} ([#{pr.number}]({pr.url}))")
        lines.append("")
    if all(not grouped.get(t) for t in SUPPORTED_TYPES):
        lines.append("No merged pull requests since the last tag.")
        lines.append("")
    lines.append("## Meta")
    if last_tag:
        lines.append(f"- Compared against previous tag `{last_tag}`")
    else:
        lines.append("- No prior tag found; included history from repository start")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append(f"- Generated on {timestamp}")
    if contributors:
        lines.append(f"- Contributors: {', '.join(sorted(set(contributors)))}")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    dist_path = repo_root / "dist"
    dist_path.mkdir(parents=True, exist_ok=True)

    repo = detect_repo()
    token = determine_token()
    last_tag = get_last_tag(repo_root)
    pr_numbers = extract_pr_numbers(repo_root, last_tag)

    prs: List[PullRequest] = []
    contributors: List[str] = []
    for number in pr_numbers:
        pr = fetch_pr(repo, token, number)
        if pr is None:
            continue
        prs.append(pr)
        contributors.append(pr.author)

    grouped = group_prs(prs)
    notes = build_release_notes(last_tag, grouped, contributors)

    output_file = dist_path / "RELEASE_NOTES_v1.2.md"
    output_file.write_text(notes, encoding="utf-8")

    print(
        json.dumps(
            {
                "release": RELEASE_VERSION,
                "title": RELEASE_TITLE,
                "pr_count": len(prs),
                "output": str(output_file.relative_to(repo_root)),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
