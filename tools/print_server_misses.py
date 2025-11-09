from __future__ import annotations

import collections
import pathlib
import xml.etree.ElementTree as ET


def print_server_misses(xml_path: str = "coverage.xml") -> None:
    """Print uncovered server/ file line ranges from coverage.xml for triage."""

    path = pathlib.Path(xml_path)
    tree = ET.fromstring(path.read_text())
    misses: dict[str, list[int]] = collections.defaultdict(list)
    for klass in tree.findall(".//class"):
        filename = klass.get("filename", "")
        if not filename.startswith("server/"):
            continue
        for line in klass.findall("./lines/line"):
            if line.get("hits") == "0":
                misses[filename].append(int(line.get("number")))
    for filename, lines in sorted(misses.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if not lines:
            continue
        span = f"{min(lines)}..{max(lines)} ({len(lines)} lines)"
        print(f"{filename:50s}  {span}")


if __name__ == "__main__":
    print_server_misses()
