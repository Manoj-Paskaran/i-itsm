from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    gemini_api_key: SecretStr | None = None
    gemini_model: str = ""
    gemini_fallback_model: str = ""
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    artifacts_dir: Path = Path("artifacts")
    sla_risk_engine: Literal["rules", "model"] = "rules"
    port: int = Field(default=8001, ge=1, le=65535)

    embedding_dim: int = Field(default=384, gt=0)
    embedding_provider: Literal["local", "gemini"] = "local"
    gemini_embedding_model: str = "gemini-embedding-001"
    fastembed_cache_path: Path = Path(".cache/fastembed")
    embedding_local_only: bool = False

    classifier_confidence_threshold: float = Field(default=0.55, ge=0, le=1)

    gemini_timeout_seconds: float = Field(default=20, gt=0)
    gemini_retries: int = Field(default=2, ge=0, le=5)
    gemini_backoff_seconds: float = Field(default=0.25, ge=0)
    ai_cache_size: int = Field(default=128, ge=1, le=4096)
    chat_intake_replay_ms: int = Field(default=1200, ge=0)
    # Kept below the API's CHAT_INTAKE_TIMEOUT_MS (15 s) so the API never gives up first.
    # False skips the seeded fixture, e.g. to try a live Gemini call on the demo message.
    chat_intake_use_fixture: bool = True
    chat_intake_timeout_seconds: float = Field(default=10, gt=0)
