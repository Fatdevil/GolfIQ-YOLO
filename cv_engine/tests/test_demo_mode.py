from pathlib import Path

from scripts import run_demo


def test_demo_case_verify_ready(tmp_path: Path) -> None:
    out_path = tmp_path / "ready.json"
    metrics = run_demo.run_demo_case("ready", out_path=out_path, verify=True)

    assert "explain_result" in metrics
    assert "micro_coach" in metrics

    tips = metrics["micro_coach"]["tips"]
    assert len(tips) <= 3

    golden = run_demo.load_golden("ready")
    assert [tip["id"] for tip in tips] == [
        tip["id"] for tip in golden["micro_coach"]["tips"]
    ]
