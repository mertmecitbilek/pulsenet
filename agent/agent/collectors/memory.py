"""
PulseNet Agent — Memory Collector

Collects RAM usage statistics using psutil.
"""

from dataclasses import dataclass

import psutil


@dataclass(frozen=True)
class MemoryMetrics:
    """Immutable snapshot of memory statistics."""

    percent: float        # Usage percentage (0–100)
    used_mb: float        # Used RAM in megabytes
    total_mb: float       # Total RAM in megabytes


def collect_memory() -> MemoryMetrics:
    """Return current memory usage statistics.

    Uses psutil.virtual_memory() which reads from /proc/meminfo on Linux.
    """
    mem = psutil.virtual_memory()
    return MemoryMetrics(
        percent=mem.percent,
        used_mb=round(mem.used / 1024 / 1024, 2),
        total_mb=round(mem.total / 1024 / 1024, 2),
    )
