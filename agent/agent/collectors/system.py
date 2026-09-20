"""
PulseNet Agent — System Info Collector

Collects host-level information: uptime, hostname, OS details.
"""

import platform
import socket
import time
from dataclasses import dataclass

import psutil


@dataclass(frozen=True)
class SystemInfo:
    """Static + dynamic host information."""

    hostname: str
    ip_address: str
    os: str                  # e.g. "Linux 5.15.0"
    uptime_seconds: float    # Seconds since last boot


def collect_system_info() -> SystemInfo:
    """Return current system information.

    Uptime is calculated as (current_time − boot_time) using psutil,
    which reads /proc/stat on Linux.
    """
    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time

    # Best-effort hostname resolution — fallback to socket.gethostname()
    hostname = socket.gethostname()
    try:
        ip_address = socket.gethostbyname(hostname)
    except socket.gaierror:
        ip_address = "127.0.0.1"

    os_info = f"{platform.system()} {platform.release()}"

    return SystemInfo(
        hostname=hostname,
        ip_address=ip_address,
        os=os_info,
        uptime_seconds=round(uptime_seconds, 2),
    )
