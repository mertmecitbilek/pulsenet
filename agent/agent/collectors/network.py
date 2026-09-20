"""
PulseNet Agent — Network I/O Collector

Collects delta bytes sent/received per collection interval using psutil.
On the first call there is no previous snapshot, so returns (0, 0).
"""

import psutil
from dataclasses import dataclass

_prev_bytes_sent: float | None = None
_prev_bytes_recv: float | None = None


@dataclass
class NetworkInfo:
    bytes_sent_delta: float  # bytes sent since last collection
    bytes_recv_delta: float  # bytes received since last collection


def collect_network() -> NetworkInfo:
    """Return network bytes sent/recv since the last call (delta)."""
    global _prev_bytes_sent, _prev_bytes_recv

    counters = psutil.net_io_counters()
    current_sent = float(counters.bytes_sent)
    current_recv = float(counters.bytes_recv)

    if _prev_bytes_sent is None or _prev_bytes_recv is None:
        # First call — no delta available yet
        _prev_bytes_sent = current_sent
        _prev_bytes_recv = current_recv
        return NetworkInfo(bytes_sent_delta=0.0, bytes_recv_delta=0.0)

    delta_sent = max(0.0, current_sent - _prev_bytes_sent)
    delta_recv = max(0.0, current_recv - _prev_bytes_recv)

    _prev_bytes_sent = current_sent
    _prev_bytes_recv = current_recv

    return NetworkInfo(bytes_sent_delta=delta_sent, bytes_recv_delta=delta_recv)
