from arhud.telemetry_client import METRIC_NAMES, StructuredLogger, TelemetryClient, TraceSampler


def test_metrics_emitter_records_required_fields():
    client = TelemetryClient()
    for name in METRIC_NAMES:
        client.emit(name=name, value=1.0, device_class="iphone14", sampled=False)
    assert len(client.records) == len(METRIC_NAMES)
    assert all(record.device_class == "iphone14" for record in client.records)


def test_structured_logger_redacts_sensitive_fields():
    logger = StructuredLogger()
    logger.log(
        level="info",
        message="Test",
        build_id="abc123",
        device_class="pixel7",
        data={"frames": [1, 2, 3], "location": "GPS"},
    )
    entry = logger.entries[-1]
    assert entry["data"]["frames"] == "[redacted]"
    assert entry["data"]["location"] == "[redacted]"


def test_trace_sampler_respects_rate():
    sampler = TraceSampler(rate=0.1)
    samples = sum(1 for _ in range(100) if sampler.should_sample())
    assert samples <= 11