"""
PulseNet Agent — Reporter

Aggregates data from all collectors and sends it to the backend.

Responsibilities:
  1. Check if the host is already registered; auto-register if not.
  2. Collect CPU, memory, disk, and system metrics.
  3. POST the aggregated payload to /api/metrics.
"""

import logging

import httpx

from agent.config import settings
from agent.collectors.cpu import collect_cpu_percent
from agent.collectors.memory import collect_memory
from agent.collectors.disk import collect_disk
from agent.collectors.system import collect_system_info
from agent.collectors.network import collect_network

logger = logging.getLogger(__name__)

# Module-level host ID cache — avoids re-registering on every cycle
_cached_host_id: str | None = None


async def _register_host(client: httpx.AsyncClient, system_info) -> str:
    """Register this machine as a new host and return its assigned ID."""
    payload = {
        "name": system_info.hostname,
        "ip_address": system_info.ip_address,
        "os": system_info.os,
        "description": "Auto-registered by PulseNet agent",
    }
    response = await client.post(
        f"{settings.agent_backend_url}/api/hosts/", json=payload
    )
    response.raise_for_status()
    host_id = response.json()["id"]
    logger.info("Registered new host '%s' with id=%s", system_info.hostname, host_id)
    return host_id


async def _get_or_create_host_id(client: httpx.AsyncClient) -> str:
    """Return the host ID from config, cache, or auto-registration."""
    global _cached_host_id

    # 1. Env-configured host ID takes priority
    if settings.agent_host_id:
        return settings.agent_host_id

    # 2. Return cached ID from a previous registration
    if _cached_host_id:
        return _cached_host_id

    # 3. Auto-register this host on first run
    system_info = collect_system_info()
    _cached_host_id = await _register_host(client, system_info)
    return _cached_host_id


async def collect_and_report() -> None:
    """Run one complete collect → report cycle.

    Collects all metrics from local collectors and POSTs them to
    the backend /api/metrics endpoint.
    """
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"X-Agent-Key": settings.agent_api_key},
    ) as client:
        try:
            host_id = await _get_or_create_host_id(client)

            # Gather metrics from each collector (SRP — each module owns its domain)
            cpu_pct = collect_cpu_percent(interval=1.0)
            memory  = collect_memory()
            disk    = collect_disk(path="/")
            system  = collect_system_info()
            network = collect_network()

            payload = {
                "host_id": host_id,
                "cpu_percent": cpu_pct,
                "memory_percent": memory.percent,
                "memory_used_mb": memory.used_mb,
                "memory_total_mb": memory.total_mb,
                "disk_percent": disk.percent,
                "disk_used_gb": disk.used_gb,
                "disk_total_gb": disk.total_gb,
                "uptime_seconds": system.uptime_seconds,
                "net_bytes_sent": network.bytes_sent_delta,
                "net_bytes_recv": network.bytes_recv_delta,
            }

            response = await client.post(
                f"{settings.agent_backend_url}/api/metrics/", json=payload
            )
            response.raise_for_status()
            logger.debug(
                "Reported: CPU=%.1f%% MEM=%.1f%% DISK=%.1f%%",
                cpu_pct,
                memory.percent,
                disk.percent,
            )

        except httpx.HTTPStatusError as exc:
            global _cached_host_id
            if exc.response.status_code == 404 and _cached_host_id and not settings.agent_host_id:
                # Host was deleted from the dashboard — register again next cycle.
                logger.warning("Host %s no longer exists; re-registering", _cached_host_id)
                _cached_host_id = None
            else:
                logger.error("Backend returned error: %s", exc.response.text)
        except httpx.RequestError as exc:
            logger.warning("Could not reach backend: %s", exc)
