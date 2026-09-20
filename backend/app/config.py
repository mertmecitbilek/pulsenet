"""
PulseNet Backend — Application Configuration
Reads all settings from environment variables (or .env file).
Using pydantic-settings for type-safe, validated configuration.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised, environment-driven settings object.

    All values are read once at startup and shared across the
    application via the `get_settings()` dependency.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    environment: str = "development"
    # SECURITY: In production, set a strong SECRET_KEY via environment variable.
    # Never commit a real secret to source control.
    secret_key: str = "changeme-set-a-strong-random-key-in-production"

    # Database
    database_url: str = "postgresql+asyncpg://pulsenet:pulsenet_secret@db:5432/pulsenet"

    # Alert thresholds (percentage values, 0–100)
    alert_cpu_threshold: float = 90.0
    alert_memory_threshold: float = 85.0
    alert_disk_threshold: float = 80.0

    # Comma-separated list of browser origins allowed to call the API
    cors_origins: str = "http://localhost:3000"

    # Single-user by default: once the first account exists, /register is
    # closed. Set to true to let additional people sign up (as viewers).
    allow_multiple_users: bool = False

    # Agent API key — agents must include this in X-Agent-Key header
    # to POST metrics without a user JWT. Set a strong value in .env.
    agent_api_key: str = "pulsenet-agent-secret-key"

    # Data retention — metrics and resolved alerts older than this are deleted
    # Set to 0 to disable pruning entirely.
    data_retention_days: int = 14

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


# Module-level singleton — import this in other modules
settings = Settings()
