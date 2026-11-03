from collections.abc import Sequence
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from itsm_ml.classifiers.category import CategoryClassifier
from itsm_ml.config import Settings
from itsm_ml.embeddings.embedder import FastEmbedEmbedder
from itsm_ml.schemas.models import Candidate, Prediction


class TrainedCategoryClassifier(CategoryClassifier):
    def __init__(self, path: Path) -> None:
        bundle: dict[str, Any] = joblib.load(path)
        self.estimator = bundle["estimator"]
        self.metadata = bundle["metadata"]
        self.kind = bundle["kind"]
        self.embedder: FastEmbedEmbedder | None = None

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        inputs: Any = [text]
        if self.kind == "embedding-logreg":
            if self.embedder is None:
                settings = Settings()
                self.embedder = FastEmbedEmbedder(
                    settings.embedding_model,
                    settings.embedding_dim,
                    settings.fastembed_cache_path,
                    settings.embedding_local_only,
                )
            inputs = self.embedder.embed([text])
        scores = self.estimator.predict_proba(inputs)[0]
        candidates = [
            Candidate(category=str(label), score=float(score))
            for label, score in zip(self.estimator.classes_, scores, strict=True)
            if allowed is None or str(label) in allowed
        ]
        total = sum(c.score for c in candidates)
        if not candidates or not np.isfinite(total) or total <= 0:
            raise ValueError("No known allowed categories")
        candidates = [c.model_copy(update={"score": c.score / total}) for c in candidates]
        candidates.sort(key=lambda c: c.score, reverse=True)
        return Prediction(
            category=candidates[0].category,
            confidence=candidates[0].score,
            candidates=candidates,
            source="model",
        )
