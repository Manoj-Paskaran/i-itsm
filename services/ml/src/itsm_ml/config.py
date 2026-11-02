from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: SecretStr | None = None
    gemini_model: str = ""
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    artifacts_dir: Path = Path("artifacts")
    port: int = Field(default=8001, ge=1, le=65535)
