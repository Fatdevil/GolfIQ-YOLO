from __future__ import annotations

from types import SimpleNamespace

import pytest

from server.storage import s3signer


@pytest.fixture(autouse=True)
def reset_client(monkeypatch):
    monkeypatch.setattr(s3signer, "_CLIENT", None)


def test_bool_env_variants(monkeypatch):
    monkeypatch.delenv("FEATURE_FLAG", raising=False)
    assert s3signer._bool_env("FEATURE_FLAG", default=True) is True

    monkeypatch.setenv("FEATURE_FLAG", "off")
    assert s3signer._bool_env("FEATURE_FLAG") is False

    monkeypatch.setenv("FEATURE_FLAG", "YeS")
    assert s3signer._bool_env("FEATURE_FLAG") is True


def test_client_configuration_and_presign(monkeypatch):
    captured: dict[str, object] = {}

    def fake_config(*, signature_version: str, s3: dict[str, str]):
        captured["config"] = {"signature_version": signature_version, "s3": s3}
        return SimpleNamespace(signature_version=signature_version, s3=s3)

    class FakeClient:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def generate_presigned_url(self, **kwargs):
            self.calls.append(kwargs)
            captured["presigned"] = kwargs
            return "http://example.com/upload"

    fake_client = FakeClient()

    def boto3_client(name: str, **kwargs):
        captured["service"] = name
        captured["client_kwargs"] = kwargs
        return fake_client

    monkeypatch.setattr(s3signer, "Config", fake_config)
    monkeypatch.setattr(s3signer, "boto3", SimpleNamespace(client=boto3_client))
    monkeypatch.setenv("S3_REGION", "us-west-2")
    monkeypatch.setenv("S3_ACCESS_KEY", "access")
    monkeypatch.setenv("S3_SECRET_KEY", "secret")
    monkeypatch.setenv("S3_ENDPOINT", "http://localhost:9000")
    monkeypatch.setenv("S3_FORCE_PATH_STYLE", "true")
    monkeypatch.setenv("S3_BUCKET", "golfiq-runs")

    result = s3signer.get_presigned_put("runs/data.zip", ttl_days=10)

    assert captured["service"] == "s3"
    client_kwargs = captured["client_kwargs"]
    assert client_kwargs["region_name"] == "us-west-2"
    assert client_kwargs["aws_access_key_id"] == "access"
    assert client_kwargs["aws_secret_access_key"] == "secret"
    assert client_kwargs["endpoint_url"] == "http://localhost:9000"
    assert captured["config"] == {
        "signature_version": "s3v4",
        "s3": {"addressing_style": "path"},
    }

    presigned = captured["presigned"]
    assert presigned["ClientMethod"] == "put_object"
    assert presigned["Params"] == {"Bucket": "golfiq-runs", "Key": "runs/data.zip"}
    assert presigned["ExpiresIn"] == 7 * 24 * 60 * 60
    assert presigned["HttpMethod"] == "PUT"

    assert result["url"] == "http://example.com/upload"
    assert result["headers"] == {"Content-Type": "application/zip"}
    assert result["bucket"] == "golfiq-runs"
    assert result["expiresAt"].endswith("Z")

    # Ensure the cached client is reused on subsequent calls
    second = s3signer._client()
    assert second is fake_client


def test_presign_minimum_ttl(monkeypatch):
    captured: dict[str, object] = {}

    class FakeClient:
        def generate_presigned_url(self, **kwargs):
            captured.update(kwargs)
            return "http://example.com/put"

    def boto3_client(name: str, **kwargs):
        return FakeClient()

    monkeypatch.setattr(s3signer, "boto3", SimpleNamespace(client=boto3_client))
    monkeypatch.setenv("S3_BUCKET", "demo-bucket")

    result = s3signer.get_presigned_put("runs/min.zip", ttl_days=0)

    assert captured["ExpiresIn"] == 24 * 60 * 60
    assert result["bucket"] == "demo-bucket"


def test_presign_requires_bucket(monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)

    with pytest.raises(RuntimeError):
        s3signer.get_presigned_put("runs/missing.zip", ttl_days=1)
