"""
PulseNet Backend — Alert Service

Evaluates incoming metrics against per-host thresholds and manages
the full alert lifecycle: open, update, and auto-resolve.

Rules:
  - CPU    > host.alert_cpu_threshold    → "cpu"    alert
  - Memory > host.alert_memory_threshold → "memory" alert
  - Disk   > host.alert_disk_threshold   → "disk"   alert

Deduplication:
  - If open alerts already exist for (host_id, metric_type), only one
    is kept (value/severity updated). All extras are auto-resolved.

Auto-resolution:
  - If a metric is back within threshold, ALL open alerts for that
    (host_id, metric_type) are marked as "resolved".

Host availability:
  - When a host stops reporting, `handle_host_down` opens a critical
    "host_down" alert and resolves that host's open resource alerts
    (their values are stale once the host is unreachable).
  - The next metric received from the host resolves the "host_down" alert.
"""

from datetime import datetime, timezone

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.metric import Metric
from app.models.host import Host


HOST_DOWN = "host_down"


def _build_checks(metric: Metric, host: Host) -> list[tuple[str, float, float]]:
    """Return a list of (metric_type, actual_value, threshold) tuples."""
    return [
        ("cpu",    metric.cpu_percent,    host.alert_cpu_threshold),
        ("memory", metric.memory_percent, host.alert_memory_threshold),
        ("disk",   metric.disk_percent,   host.alert_disk_threshold),
    ]


def _determine_severity(value: float, threshold: float) -> str:
    """Critical if the value exceeds threshold by >10 points, else warning."""
    return "critical" if value >= threshold + 10 else "warning"


class AlertService:
    """Evaluates metrics and manages the full alert lifecycle."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _get_open_alerts(
        self, host_id: str, metric_type: str
    ) -> list[Alert]:
        """Return ALL existing open alerts for (host_id, metric_type)."""
        result = await self._db.execute(
            select(Alert)
            .where(Alert.host_id == host_id)
            .where(Alert.metric_type == metric_type)
            .where(Alert.status == "open")
            .order_by(Alert.triggered_at)  # oldest first
        )
        return list(result.scalars().all())

    def _resolve_alert(self, alert: Alert) -> None:
        """Mark a single alert as resolved with the current timestamp."""
        alert.status = "resolved"
        alert.resolved_at = datetime.now(timezone.utc)

    async def evaluate_and_save(self, metric: Metric, host: Host) -> None:
        """Check thresholds and manage alerts for a single metric snapshot.

        For each metric type (cpu, memory, disk):
          - If threshold breached:
              · Keep/update the oldest open alert (prevents spam).
              · Resolve any extra duplicate open alerts.
              · If none exist, create a new one.
          - If within threshold:
              · Resolve ALL open alerts for that metric type.
        """
        changed = False

        # A metric arriving means the host is reachable again
        for down_alert in await self._get_open_alerts(host.id, HOST_DOWN):
            self._resolve_alert(down_alert)
            changed = True

        for metric_type, value, threshold in _build_checks(metric, host):
            open_alerts = await self._get_open_alerts(host.id, metric_type)

            if value > threshold:
                severity = _determine_severity(value, threshold)
                message = (
                    f"{metric_type.upper()} usage at {value:.1f}% "
                    f"(threshold: {threshold}%)"
                )

                if open_alerts:
                    # Keep the oldest alert, update its value/severity
                    canonical = open_alerts[0]
                    canonical.value = round(value, 2)
                    canonical.severity = severity
                    canonical.message = message

                    # Resolve all duplicate extras
                    for duplicate in open_alerts[1:]:
                        self._resolve_alert(duplicate)
                else:
                    # No existing alert — create one
                    self._db.add(Alert(
                        host_id=host.id,
                        metric_type=metric_type,
                        severity=severity,
                        value=round(value, 2),
                        threshold=threshold,
                        message=message,
                    ))

                changed = True

            elif open_alerts:
                # Metric is within threshold → resolve ALL open alerts
                for alert in open_alerts:
                    self._resolve_alert(alert)
                changed = True

        if changed:
            await self._db.commit()

    async def handle_host_down(self, host: Host, timeout_s: int) -> None:
        """Open a "host_down" alert and close the host's stale resource alerts.

        Does not commit — the caller owns the transaction.
        """
        result = await self._db.execute(
            select(Alert)
            .where(Alert.host_id == host.id)
            .where(Alert.status == "open")
            .where(Alert.metric_type.in_(["cpu", "memory", "disk", HOST_DOWN]))
        )
        already_down = False
        for open_alert in result.scalars().all():
            if open_alert.metric_type == HOST_DOWN:
                already_down = True
            else:
                self._resolve_alert(open_alert)

        if already_down:
            return

        last_seen = (
            host.last_seen_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if host.last_seen_at else "never"
        )
        self._db.add(Alert(
            host_id=host.id,
            metric_type=HOST_DOWN,
            severity="critical",
            value=float(timeout_s),
            threshold=float(timeout_s),
            message=f"Host is offline — no data received for over {timeout_s}s (last seen {last_seen})",
        ))

    async def get_recent_alerts(
        self, host_id: str | None = None, limit: int = 50
    ) -> list[Alert]:
        """Fetch recent alerts, optionally filtered by host."""
        query = select(Alert).order_by(desc(Alert.triggered_at)).limit(limit)
        if host_id:
            query = query.where(Alert.host_id == host_id)
        result = await self._db.execute(query)
        return list(result.scalars().all())

    async def get_open_alert_count(self) -> int:
        """Count currently open alerts using an efficient SQL COUNT query."""
        result = await self._db.execute(
            select(func.count()).where(Alert.status == "open").select_from(Alert)
        )
        return result.scalar_one()

    async def acknowledge_alert(
        self, alert_id: str, user_name: str, note: str | None = None
    ) -> Alert | None:
        """Mark an alert as acknowledged.

        Sets acknowledged=True and records who acknowledged it, when, and
        an optional free-text note. Already-acknowledged alerts are returned
        unchanged (idempotent). Returns None if the alert does not exist.
        """
        alert = await self._db.get(Alert, alert_id)
        if not alert:
            return None

        # Idempotent — don't overwrite a prior acknowledgement
        if not alert.acknowledged:
            alert.acknowledged    = True
            alert.ack_note        = note
            alert.acknowledged_by = user_name
            alert.acknowledged_at = datetime.now(timezone.utc)
            await self._db.commit()
            await self._db.refresh(alert)

        return alert

