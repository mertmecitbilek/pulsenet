"""
PulseNet Backend — Async Database Engine & Session Factory

Uses SQLAlchemy 2.x async engine with asyncpg driver.
All DB operations must be wrapped in an `AsyncSession` obtained
from `get_db()` FastAPI dependency.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Create a single async engine for the entire application lifetime.
# pool_pre_ping=True handles dropped connections gracefully.
engine = create_async_engine(
    settings.database_url,
    echo=settings.is_development,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory — expire_on_commit=False avoids extra SELECTs
# after a commit in async context.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""
    pass


async def init_db() -> None:
    """Create all tables that don't exist yet.

    Called once during application startup via lifespan.
    In production you'd use Alembic migrations exclusively,
    but this ensures the schema is always in sync during dev.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a per-request DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
