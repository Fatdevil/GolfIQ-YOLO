from __future__ import annotations

import os
import threading
from typing import Any, Dict, Tuple

import boto3
from botocore.config import Config

__all__ = ["presign_put"]

_CLIENT = None
_LOCK = threading.Lock()


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    with _LOCK:
        if _CLIENT is not None:
            return _CLIENT
        endpoint = os.getenv("CLIPS_S3_ENDPOINT") or os.getenv("S3_ENDPOINT")
        region = os.getenv("CLIPS_S3_REGION") or os.getenv("S3_REGION", "us-east-1")
        access_key = os.getenv("CLIPS_S3_ACCESS_KEY") or os.getenv("S3_ACCESS_KEY")
        secret_key = os.getenv("CLIPS_S3_SECRET_KEY") or os.getenv("S3_SECRET_KEY")
        force_path_style = _bool_env("CLIPS_S3_FORCE_PATH_STYLE") or _bool_env(
            "S3_FORCE_PATH_STYLE"
        )

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


def presign_put(
    key: str, *, content_type: str, expires: int = 60
) -> Tuple[str, Dict[str, Any]]:
    bucket = os.getenv("CLIPS_BUCKET") or os.getenv("S3_BUCKET")
    if not bucket:
        raise RuntimeError("CLIPS_BUCKET (or S3_BUCKET) must be configured")
    expires = max(30, min(int(expires or 60), 300))
    client = _client()
    fields = {"Content-Type": content_type}
    conditions = [{"Content-Type": content_type}]
    post = client.generate_presigned_post(
        bucket,
        key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=expires,
    )
    return post["url"], post["fields"]
