"""
PulseNet Backend — WebSocket Live Metrics

Endpoint: /ws/metrics/{host_id}

Authentication: the client sends its JWT as the very first message after the
socket opens. A query parameter would be simpler, but URLs end up in server
access logs and proxy logs, which must not contain credentials.
Unauthenticated clients are closed with code 4401.

The server polls the latest metric every PUSH_INTERVAL seconds but only pushes
it when it is a new row, so the client never receives duplicates.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import AsyncSessionLocal
from app.services.auth_service import get_user_from_token
from app.services.metric_service import MetricService

router = APIRouter(tags=["websockets"])

PUSH_INTERVAL = 2.0
AUTH_TIMEOUT = 10.0
WS_CLOSE_UNAUTHORIZED = 4401


def _serialize_metric(metric) -> str:
    """Serialize a Metric ORM object to a JSON string."""
    return json.dumps(
        {
            "id": metric.id,
            "host_id": metric.host_id,
            "timestamp": metric.timestamp.isoformat() if metric.timestamp else None,
            "cpu_percent": metric.cpu_percent,
            "memory_percent": metric.memory_percent,
            "memory_used_mb": metric.memory_used_mb,
            "memory_total_mb": metric.memory_total_mb,
            "disk_percent": metric.disk_percent,
            "disk_used_gb": metric.disk_used_gb,
            "disk_total_gb": metric.disk_total_gb,
            "uptime_seconds": metric.uptime_seconds,
            "net_bytes_sent": metric.net_bytes_sent,
            "net_bytes_recv": metric.net_bytes_recv,
        }
    )


def _read_token(raw: str) -> str:
    """Accept either a bare token or {"token": "..."} as the auth message."""
    raw = raw.strip()
    if raw.startswith("{"):
        try:
            return str(json.loads(raw).get("token") or "")
        except json.JSONDecodeError:
            return ""
    return raw


async def _authenticate(websocket: WebSocket) -> bool:
    """Wait for the client's first message and validate the JWT in it."""
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        return False

    token = _read_token(raw)
    if not token:
        return False

    async with AsyncSessionLocal() as db:
        return await get_user_from_token(token, db) is not None


@router.websocket("/ws/metrics/{host_id}")
async def live_metrics(websocket: WebSocket, host_id: str) -> None:
    """Stream new metrics for a host as they arrive."""
    await websocket.accept()

    if not await _authenticate(websocket):
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    last_id: str | None = None
    sent_no_data = False
    try:
        while True:
            async with AsyncSessionLocal() as db:
                metric = await MetricService(db).get_latest(host_id)

            if metric is None:
                if not sent_no_data:
                    await websocket.send_text(json.dumps({"status": "no_data"}))
                    sent_no_data = True
            elif metric.id != last_id:
                await websocket.send_text(_serialize_metric(metric))
                last_id = metric.id

            # Waiting on receive doubles as the tick and surfaces client
            # disconnects immediately instead of at the next push.
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=PUSH_INTERVAL)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        await websocket.close(code=1011, reason=str(exc)[:100])
