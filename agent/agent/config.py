"""
PulseNet Agent — Configuration

Reads settings from environment variables or .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Agent-specific configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # URL of the PulseNet backend API
    agent_backend_url: str = "http://backend:8000"

    # Seconds between each collection + report cycle
    agent_collect_interval: int = 10

    # Host UUID to report metrics under.
    # If empty, the agent will auto-register itself on first run.
    agent_host_id: str = ""

    # API key for authenticating agent requests to the backend.
    # Must match the AGENT_API_KEY env var on the backend.
    agent_api_key: str = "pulsenet-agent-secret-key"


settings = AgentSettings()
