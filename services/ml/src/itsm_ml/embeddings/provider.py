import threading
from typing import Any

from itsm_ml.config import Settings
from itsm_ml.embeddings.embedder import Embedder, FastEmbedEmbedder, GeminiEmbedder


def get_embedder(state: Any) -> Embedder:
    lock: threading.Lock = state.embedding_lock
    with lock:
        if state.embedder is None:
            settings: Settings = state.settings
            if settings.embedding_provider == "gemini":
                if not settings.gemini_api_key:
                    raise ValueError("Gemini embedding requires GEMINI_API_KEY")
                state.embedder = GeminiEmbedder(
                    settings.gemini_api_key.get_secret_value(),
                    settings.gemini_embedding_model,
                    settings.embedding_dim,
                )
            else:
                state.embedder = FastEmbedEmbedder(
                    settings.embedding_model,
                    settings.embedding_dim,
                    settings.fastembed_cache_path,
                    settings.embedding_local_only,
                )
        embedder: Embedder = state.embedder
        return embedder
