"""
PulseNet Agent — CPU Collector

Collects CPU usage percentage using psutil.
Single-responsibility: only CPU-related metrics.
"""

import psutil


def collect_cpu_percent(interval: float = 1.0) -> float:
    """Return the overall CPU utilisation percentage.

    Args:
        interval: Time (seconds) over which to measure CPU usage.
                  A value of 1.0 gives a more accurate reading than 0.

    Returns:
        Float between 0.0 and 100.0 representing CPU usage.
    """
    return psutil.cpu_percent(interval=interval)
