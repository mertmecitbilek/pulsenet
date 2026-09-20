"""
PulseNet Agent — Main Entry Point

Runs an infinite async loop that:
  1. Waits for the backend to become available (with retry backoff).
  2. Calls collect_and_report() every AGENT_COLLECT_INTERVAL seconds.

The startup wait is important because in Docker Compose the backend
container may not be ready immediately after the agent starts.
"""

import asyncio
import logging
import sys
import time

import httpx

from agent.config import settings
from agent.reporter import collect_and_report

# ---------------------------------------------------------------------------
# Logging — structured output with timestamps
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("pulsenet.agent")

# Maximum seconds to wait for backend during startup
STARTUP_TIMEOUT = 120
STARTUP_RETRY_DELAY = 5


async def _wait_for_backend() -> None:
    """Retry the health endpoint until the backend is reachable.

    Implements exponential-ish backoff by doubling the delay each round,
    capped at STARTUP_RETRY_DELAY seconds, up to STARTUP_TIMEOUT total.
    """
    logger.info("Waiting for backend at %s …", settings.agent_backend_url)
    elapsed = 0

    async with httpx.AsyncClient(timeout=5.0) as client:
        while elapsed < STARTUP_TIMEOUT:
            try:
                response = await client.get(f"{settings.agent_backend_url}/health")
                if response.status_code == 200:
                    logger.info("Backend is ready ✓")
                    return
            except httpx.RequestError:
                pass  # Backend not yet available — retry

            logger.info(
                "Backend not ready, retrying in %ds … (%ds elapsed)",
                STARTUP_RETRY_DELAY,
                elapsed,
            )
            await asyncio.sleep(STARTUP_RETRY_DELAY)
            elapsed += STARTUP_RETRY_DELAY

    logger.error("Backend did not become ready within %ds. Exiting.", STARTUP_TIMEOUT)
    sys.exit(1)


async def run_agent_loop() -> None:
    """Core agent loop: collect and report on a fixed interval."""
    await _wait_for_backend()

    logger.info(
        "Starting metric collection every %ds", settings.agent_collect_interval
    )

    while True:
        started = time.monotonic()
        try:
            await collect_and_report()
        except Exception as exc:
            # Don't let a single failed cycle crash the agent
            logger.error("Unexpected error in collection cycle: %s", exc)

        # Subtract the time the cycle itself took (CPU sampling blocks ~1s) so
        # reports land exactly every interval; the UI's KB/s maths relies on it.
        elapsed = time.monotonic() - started
        await asyncio.sleep(max(0.0, settings.agent_collect_interval - elapsed))


if __name__ == "__main__":
    asyncio.run(run_agent_loop())
