import xml.etree.ElementTree as ET
import pathlib
import collections

xml = pathlib.Path("coverage.xml")

t = ET.fromstring(xml.read_text())
miss = collections.defaultdict(list)
for cls in t.findall(".//class"):
    filename = cls.get("filename", "")
    if not filename:
        continue
    if filename.startswith(".."):  # normalize relative paths
        filename = pathlib.Path(filename).name
    lines = [int(line.get("number")) for line in cls.findall("./lines/line") if line.get("hits") == "0"]
    if lines:
        miss[filename].extend(lines)

for filename, lines in sorted(miss.items(), key=lambda kv: -len(kv[1])):
    span = f"{min(lines)}..{max(lines)} ({len(lines)} lines)"
    print(f"{filename:50s}  {span}")
