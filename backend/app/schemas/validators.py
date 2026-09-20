"""
PulseNet Backend — Shared input validators

Host addresses end up as arguments to the ping binary and as connection
targets, so they are validated in one place and reused by every schema.
"""

import ipaddress
import re

# A hostname label may not start with "-", which also keeps the value from
# being mistaken for a command-line flag by the ping binary.
_HOSTNAME_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.\-]{0,251}[A-Za-z0-9])?$")


def is_valid_host(value: str) -> bool:
    """True if the value is a usable IP address or hostname."""
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return bool(_HOSTNAME_RE.match(value))
