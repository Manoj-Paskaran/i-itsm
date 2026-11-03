from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    gemini_api_key: SecretStr | None = None
    gemini_model: str = ""
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    artifacts_dir: Path = Path("artifacts")
    port: int = Field(default=8001, ge=1, le=65535)

    embedding_dim: int = Field(default=384, gt=0)
    embedding_provider: Literal["local", "gemini"] = "local"
    gemini_embedding_model: str = "gemini-embedding-001"
    fastembed_cache_path: Path = Path(".cache/fastembed")
    embedding_local_only: bool = False
