from arhud.perf_overlay import PerfOverlay, PerfSample


def test_perf_overlay_records_when_enabled():
    overlay = PerfOverlay()
    overlay.toggle()
    overlay.record(
        PerfSample(fps=45, latency_ms=90, tracking_quality=0.8, thermal_level="warm")
    )
    assert len(overlay.samples) == 1
