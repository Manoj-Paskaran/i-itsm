from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np


class Embedder(ABC):
    model: str
    dim: int

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return finite, normalised vectors with the configured dimension."""


def normalise(vectors: list[list[float]], count: int, dim: int) -> list[list[float]]:
    array = np.asarray(vectors, dtype=float)
    if array.shape != (count, dim) or not np.isfinite(array).all():
        raise ValueError("Embedding output does not match configured dimension")
    norms = np.linalg.norm(array, axis=1, keepdims=True)
    if (norms == 0).any():
        raise ValueError("Embedding output contains zero vectors")
    return (array / norms).tolist()  # type: ignore[no-any-return]


class FastEmbedEmbedder(Embedder):
    def __init__(
        self,
        model: str = "BAAI/bge-small-en-v1.5",
        dim: int = 384,
        cache_dir: Path | None = None,
        local_only: bool = False,
    ) -> None:
        from fastembed import TextEmbedding

        self.model = model
        self.dim = dim
        self._backend = TextEmbedding(
            model_name=model,
            cache_dir=str(cache_dir) if cache_dir else None,
            local_files_only=local_only,
            threads=2,
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = [vector.tolist() for vector in self._backend.embed(texts)]
        return normalise(vectors, len(texts), self.dim)


class GeminiEmbedder(Embedder):
    def __init__(self, api_key: str, model: str, dim: int = 384, client: Any = None) -> None:
        from google import genai

        self.model = model
        self.dim = dim
        self._client = client or genai.Client(api_key=api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        from google.genai import types

        result = self._client.models.embed_content(
            model=self.model,
            contents=[types.Content(parts=[types.Part(text=text)]) for text in texts],
            config=types.EmbedContentConfig(output_dimensionality=self.dim),
        )
        vectors = [list(e.values or []) for e in result.embeddings or []]
        return normalise(vectors, len(texts), self.dim)
