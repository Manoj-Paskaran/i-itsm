from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel

from itsm_ml.classifiers.category import KEYWORDS, CategoryClassifier
from itsm_ml.schemas.models import Candidate, Prediction


class Classification(BaseModel):
    category: str
    confidence: float


class GeminiZeroShotClassifier(CategoryClassifier):
    def __init__(
        self, api_key: str, model: str, client: Any = None, timeout_seconds: float = 20
    ) -> None:
        from google import genai
        from google.genai import types

        # No retries: classification deliberately falls back quickly.
        self.client = client or genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000))
        )
        self.model = model

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        from google.genai import types

        categories = list(allowed if allowed is not None else KEYWORDS)
        result = self.client.models.generate_content(
            model=self.model,
            contents=f"Classify the ticket. Allowed labels: {categories!r}. Ticket: {text}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=Classification
            ),
        )
        parsed = Classification.model_validate_json(result.text or "")
        if parsed.category not in categories or not 0 <= parsed.confidence <= 1:
            raise ValueError("Gemini returned an invalid category or confidence")
        return Prediction(
            category=parsed.category,
            confidence=parsed.confidence,
            candidates=[Candidate(category=parsed.category, score=parsed.confidence)],
            source="gemini",
        )
