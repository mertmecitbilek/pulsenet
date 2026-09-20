"""
PulseNet Backend — Metric Service

Business logic layer for storing and retrieving metric data.
Keeps router code thin — all DB interactions live here.
"""

from datetime import datetime, timezone, timedelta

from sqlalchemy import select, desc, func, delete, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric import Metric
from app.models.host import Host
from app.schemas.metric import MetricCreate


def _bucket_seconds(since_hours: int) -> int:
    """Aggregation bucket size for a time window (0 = return raw rows).

    Keeps every window at roughly 300-360 points so the browser never has
    to receive/plot tens of thousands of rows (7d at 10s = ~60k rows).
    """
    if since_hours <= 1:
        return 0
    if since_hours <= 6:
        return 60
    if since_hours <= 24:
        return 300
    return 1800


class MetricService:
    """Handles all metric persistence and query operations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def save(self, payload: MetricCreate) -> Metric:
        """Persist a new metric snapshot and update the host's last_seen_at."""
        metric = Metric(
            host_id=payload.host_id,
            cpu_percent=payload.cpu_percent,
            memory_percent=payload.memory_percent,
            memory_used_mb=payload.memory_used_mb,
            memory_total_mb=payload.memory_total_mb,
            disk_percent=payload.disk_percent,
            disk_used_gb=payload.disk_used_gb,
            disk_total_gb=payload.disk_total_gb,
            uptime_seconds=payload.uptime_seconds,
            net_bytes_sent=payload.net_bytes_sent,
            net_bytes_recv=payload.net_bytes_recv,
        )
        self._db.add(metric)

        # Keep the host's last_seen_at fresh so status can be inferred
        await self._db.execute(
            Host.__table__.update()
            .where(Host.id == payload.host_id)
            .values(last_seen_at=datetime.now(timezone.utc), status="online")
        )

        await self._db.commit()
        await self._db.refresh(metric)
        return metric

    async def get_history(
        self, host_id: str, limit: int = 100, since_hours: int | None = None
    ) -> list[Metric] | list[dict]:
        """Return metric history for a host.

        Args:
            host_id:     Target host UUID.
            limit:       Max rows when since_hours is None (newest first).
            since_hours: If set, return the last N hours oldest-first. Windows
                         longer than 1h are averaged into time buckets (see
                         `_bucket_seconds`); `limit` is ignored.
        """
        if since_hours is None:
            result = await self._db.execute(
                select(Metric)
                .where(Metric.host_id == host_id)
                .order_by(desc(Metric.timestamp))
                .limit(limit)
            )
            return list(result.scalars().all())

        cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
        bucket_s = _bucket_seconds(since_hours)

        if bucket_s == 0:
            result = await self._db.execute(
                select(Metric)
                .where(Metric.host_id == host_id, Metric.timestamp >= cutoff)
                .order_by(Metric.timestamp)
            )
            return list(result.scalars().all())

        # bucket_s is an internal int, inlined so GROUP BY sees the identical
        # expression (bound parameters would make Postgres reject it).
        size = literal_column(str(bucket_s))
        bucket = func.floor(func.extract("epoch", Metric.timestamp) / size) * size
        rows = (
            await self._db.execute(
                select(
                    bucket.label("bucket"),
                    func.to_timestamp(bucket).label("timestamp"),
                    func.avg(Metric.cpu_percent).label("cpu_percent"),
                    func.avg(Metric.memory_percent).label("memory_percent"),
                    func.avg(Metric.memory_used_mb).label("memory_used_mb"),
                    func.max(Metric.memory_total_mb).label("memory_total_mb"),
                    func.avg(Metric.disk_percent).label("disk_percent"),
                    func.max(Metric.disk_used_gb).label("disk_used_gb"),
                    func.max(Metric.disk_total_gb).label("disk_total_gb"),
                    func.max(Metric.uptime_seconds).label("uptime_seconds"),
                    func.avg(Metric.net_bytes_sent).label("net_bytes_sent"),
                    func.avg(Metric.net_bytes_recv).label("net_bytes_recv"),
                )
                .where(Metric.host_id == host_id, Metric.timestamp >= cutoff)
                .group_by(bucket)
                .order_by(bucket)
            )
        ).all()

        return [
            {"id": f"{host_id}:{int(r.bucket)}", "host_id": host_id, **{
                k: getattr(r, k) for k in (
                    "timestamp", "cpu_percent", "memory_percent", "memory_used_mb",
                    "memory_total_mb", "disk_percent", "disk_used_gb", "disk_total_gb",
                    "uptime_seconds", "net_bytes_sent", "net_bytes_recv",
                )
            }}
            for r in rows
        ]

    async def get_latest(self, host_id: str) -> Metric | None:
        """Return the single most recent metric for a host."""
        result = await self._db.execute(
            select(Metric)
            .where(Metric.host_id == host_id)
            .order_by(desc(Metric.timestamp))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_summary_for_all_hosts(self) -> list[Metric]:
        """Return the latest metric per host — used by the dashboard overview."""
        latest_ts_subq = (
            select(Metric.host_id, func.max(Metric.timestamp).label("max_ts"))
            .group_by(Metric.host_id)
            .subquery()
        )
        result = await self._db.execute(
            select(Metric).join(
                latest_ts_subq,
                (Metric.host_id == latest_ts_subq.c.host_id)
                & (Metric.timestamp == latest_ts_subq.c.max_ts),
            )
        )
        return list(result.scalars().all())

    async def prune_old_metrics(self, retention_days: int) -> int:
        """Delete metrics older than `retention_days`. Returns count deleted."""
        if retention_days <= 0:
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        result = await self._db.execute(
            delete(Metric).where(Metric.timestamp < cutoff)
        )
        await self._db.commit()
        return result.rowcount
