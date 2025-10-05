from __future__ import annotations

import datetime as dt
import os
import threading
from typing import Any, Dict

import boto3
from botocore.config import Config

__all__ = ["get_presigned_put"]

_CLIENT = None
_CLIENT_LOCK = threading.Lock()


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    with _CLIENT_LOCK:
        if _CLIENT is not None:
            return _CLIENT
        endpoint = os.getenv("S3_ENDPOINT")
        region = os.getenv("S3_REGION", "us-east-1")
        access_key = os.getenv("S3_ACCESS_KEY")
        secret_key = os.getenv("S3_SECRET_KEY")
        force_path_style = _bool_env("S3_FORCE_PATH_STYLE", False)

        session_kwargs: Dict[str, Any] = {}
        if access_key and secret_key:
            session_kwargs["aws_access_key_id"] = access_key
            session_kwargs["aws_secret_access_key"] = secret_key

        client_kwargs: Dict[str, Any] = {}
        if endpoint:
            client_kwargs["endpoint_url"] = endpoint

        addressing = {"addressing_style": "path" if force_path_style else "auto"}
        client = boto3.client(
            "s3",
            region_name=region,
            config=Config(signature_version="s3v4", s3=addressing),
            **session_kwargs,
            **client_kwargs,
        )
        _CLIENT = client
        return client


def get_presigned_put(key: str, ttl_days: int) -> Dict[str, Any]:
    """Return a presigned PUT URL for ``key`` that expires after ``ttl_days``."""

    bucket = os.getenv("S3_BUCKET")
    if not bucket:
        raise RuntimeError("S3_BUCKET is not configured")

    client = _client()
    ttl_days = max(ttl_days, 1)
    expires_in = min(ttl_days * 24 * 60 * 60, 7 * 24 * 60 * 60)

    url = client.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
        HttpMethod="PUT",
    )
    expires_at = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc) + dt.timedelta(days=ttl_days)

    return {
        "url": url,
        "headers": {"Content-Type": "application/zip"},
        "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
        "bucket": bucket,
    }
