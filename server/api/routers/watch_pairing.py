"""Watch pairing, device auth, SSE delivery and ACK routes."""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from functools import partial
from queue import Empty
from threading import Lock
from typing import Deque, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from server.security import require_api_key
from server.services.telemetry import emit
from server.services.watch_devices import (
    bind_device_with_code,
    make_device_token,
    mint_join_code,
    record_ack,
    register_device,
    get_primary_device_for_member,
    verify_device_token,
)
from server.services.watch_tip_bus import subscribe, unsubscribe

router = APIRouter()


class RateLimiter:
    """Simple in-memory sliding window rate limiter."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self._limit = limit
        self._window = window_seconds
        self._lock = Lock()
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.time()
        with self._lock:
            bucket = self._buckets[key]
            boundary = now - self._window
            while bucket and bucket[0] <= boundary:
                bucket.popleft()
            if len(bucket) >= self._limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="rate limit exceeded",
                )
            bucket.append(now)


_PAIR_CODE_LIMITER = RateLimiter(limit=8, window_seconds=60.0)
_DEVICE_REGISTER_LIMITER = RateLimiter(limit=12, window_seconds=60.0)
_DEVICE_BIND_LIMITER = RateLimiter(limit=20, window_seconds=60.0)
_DEVICE_TOKEN_LIMITER = RateLimiter(limit=40, window_seconds=60.0)
_DEVICE_STREAM_LIMITER = RateLimiter(limit=15, window_seconds=60.0)
_DEVICE_ACK_LIMITER = RateLimiter(limit=120, window_seconds=60.0)
_DEVICE_STATUS_LIMITER = RateLimiter(limit=40, window_seconds=60.0)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


def _enforce(limiter: RateLimiter, request: Request, bucket: str) -> None:
    limiter.check(f"{_client_key(request)}:{bucket}")


# ---- Member creates join code (guarded) ----


class JoinOut(BaseModel):
    code: str
    expTs: int


@router.post(
    "/api/watch/pair/code",
    dependencies=[Depends(require_api_key)],
    response_model=JoinOut,
)
def post_pair_code(
    request: Request, memberId: str
) -> JoinOut:  # noqa: N803 (fastapi param style)
    _enforce(_PAIR_CODE_LIMITER, request, "pair")
    join_code = mint_join_code(memberId)
    emit("watch.pair.request", {"memberId": memberId})
    return JoinOut(code=join_code.code, expTs=join_code.exp_ts)


# ---- Device registration & bind ----


class RegisterOut(BaseModel):
    deviceId: str
    deviceSecret: str


@router.post("/api/watch/devices/register", response_model=RegisterOut)
def post_register(request: Request) -> RegisterOut:
    _enforce(_DEVICE_REGISTER_LIMITER, request, "register")
    device = register_device()
    return RegisterOut(deviceId=device.device_id, deviceSecret=device.device_secret)


class BindIn(BaseModel):
    deviceId: str
    code: str


class TokenOut(BaseModel):
    token: str
    expTs: int


@router.post("/api/watch/devices/bind", response_model=TokenOut)
def post_bind(request: Request, body: BindIn) -> TokenOut:
    _enforce(_DEVICE_BIND_LIMITER, request, "bind")
    try:
        device = bind_device_with_code(body.deviceId, body.code)
    except KeyError as exc:  # invalid device or join code
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "device or code not found"
        ) from exc
    except ValueError as exc:  # expired code
        raise HTTPException(status.HTTP_410_GONE, "code expired") from exc

    try:
        token = make_device_token(device.device_id, device.device_secret)
    except KeyError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "invalid device secret"
        ) from exc

    emit(
        "watch.pair.complete",
        {"memberId": device.bound_member_id, "deviceId": device.device_id},
    )
    exp = int(token.split(".")[1])
    return TokenOut(token=token, expTs=exp)


# ---- Device token refresh ----


@router.post("/api/watch/devices/token", response_model=TokenOut)
def post_refresh_token(
    request: Request, deviceId: str, deviceSecret: str
) -> TokenOut:  # noqa: N803
    _enforce(_DEVICE_TOKEN_LIMITER, request, "token")
    try:
        token = make_device_token(deviceId, deviceSecret)
    except KeyError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "invalid device credentials"
        ) from exc
    exp = int(token.split(".")[1])
    return TokenOut(token=token, expTs=exp)


# ---- SSE stream (device-authenticated) ----


def _require_device_token(authorization: str | None, token_query: str | None):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token and token_query:
        token = token_query.strip()
    if not token:
        return None
    return verify_device_token(token)


@router.get("/api/watch/devices/stream")
async def get_device_stream(
    request: Request,
    authorization: str | None = Header(default=None),
    token: str | None = None,
) -> StreamingResponse:
    _enforce(_DEVICE_STREAM_LIMITER, request, "stream")
    device = _require_device_token(authorization, token)
    if device is None or not device.bound_member_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")

    queue = subscribe(device.bound_member_id)
    emit("watch.stream.open", {"deviceId": device.device_id})

    async def event_stream():
        yield ":ok\n\n"
        loop = asyncio.get_running_loop()
        last_ping = time.time()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    tip = await loop.run_in_executor(
                        None, partial(queue.get, True, 0.5)
                    )
                except Empty:
                    tip = None
                if tip is not None:
                    payload = json.dumps(tip.to_dict())
                    yield f"event: tip\ndata: {payload}\n\n"
                    continue
                now = time.time()
                if now - last_ping >= 15.0:
                    last_ping = now
                    yield "event: ping\ndata: {}\n\n"
                await asyncio.sleep(0.1)
        finally:
            unsubscribe(device.bound_member_id, queue)
            emit("watch.stream.close", {"deviceId": device.device_id})

    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive"}
    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers=headers
    )


# ---- ACK endpoint (device-authenticated) ----


class AckIn(BaseModel):
    tipId: str


@router.post("/api/watch/devices/ack")
def post_ack(
    request: Request,
    body: AckIn,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    _enforce(_DEVICE_ACK_LIMITER, request, "ack")
    device = _require_device_token(authorization, None)
    if device is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")

    updated = record_ack(device.device_id, body.tipId)
    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")

    emit("watch.tip.ack", {"deviceId": device.device_id, "tipId": body.tipId})
    return JSONResponse({"status": "ok"})


class DeviceStatusOut(BaseModel):
    paired: bool
    lastSeenAt: str | None = None


@router.get(
    "/api/watch/devices/status",
    dependencies=[Depends(require_api_key)],
    response_model=DeviceStatusOut,
)
def get_device_status(request: Request, memberId: str) -> DeviceStatusOut:  # noqa: N803
    """Return pairing status for the member's primary watch device."""

    _enforce(_DEVICE_STATUS_LIMITER, request, "status")
    device = get_primary_device_for_member(memberId)
    if not device:
        return DeviceStatusOut(paired=False, lastSeenAt=None)

    last_seen = datetime.fromtimestamp(device.last_seen_ts, tz=timezone.utc).isoformat()
    return DeviceStatusOut(paired=True, lastSeenAt=last_seen)
