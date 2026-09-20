"""
PulseNet Agent — Disk Collector

Collects disk usage statistics for the root partition.
"""

from dataclasses import dataclass

import psutil


@dataclass(frozen=True)
class DiskMetrics:
    """Immutable snapshot of disk usage statistics."""

    percent: float       # Usage percentage (0–100)
    used_gb: float       # Used space in gigabytes
    total_gb: float      # Total disk size in gigabytes


def collect_disk(path: str = "/") -> DiskMetrics:
    """Return disk usage statistics for the given mount point.

    Args:
        path: Mount point to inspect (default: "/" — root partition).

    Returns:
        DiskMetrics dataclass with percent, used_gb, total_gb.
    """
    usage = psutil.disk_usage(path)
    return DiskMetrics(
        percent=usage.percent,
        used_gb=round(usage.used / 1024 ** 3, 2),
        total_gb=round(usage.total / 1024 ** 3, 2),
    )
