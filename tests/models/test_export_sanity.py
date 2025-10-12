import os
import re


def test_report_exists():
    assert os.path.exists("models/EXPORT_REPORT.md")


def test_report_has_onnx_line():
    with open("models/EXPORT_REPORT.md", "r", encoding="utf-8") as f:
        txt = f.read()
    assert "Target: ONNX" in txt
    assert re.search(r"avg_latency=\d+\.\d+ ms", txt)
