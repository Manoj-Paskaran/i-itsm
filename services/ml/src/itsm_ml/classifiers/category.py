import logging
import re
from abc import ABC, abstractmethod
from collections.abc import Sequence

from itsm_ml.schemas.models import Candidate, Prediction

KEYWORDS: dict[str, tuple[str, ...]] = {
    "hardware": ("laptop", "keyboard", "monitor", "printer", "mouse", "hardware"),
    "software": ("install", "license", "update", "software", "patch"),
    "network": ("wifi", "network", "internet", "dns", "vpn", "router"),
    "database": ("database", "sql", "postgres", "query", "mysql"),
    "cloud": ("cloud", "aws", "azure", "gcp", "instance"),
    "security": ("malware", "phishing", "virus", "security", "ransomware"),
    "authentication": ("login", "password", "authentication", "mfa", "signin"),
    "application": ("application", "app", "crash", "page", "portal"),
    "storage": ("storage", "disk", "space", "backup", "volume"),
}


logger = logging.getLogger(__name__)


class CategoryClassifier(ABC):
    @abstractmethod
    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        """Return a prediction constrained to the supplied category names."""


class KeywordRuleClassifier(CategoryClassifier):
    def _scores(self, text: str, categories: Sequence[str]) -> list[int]:
        words = set(re.findall(r"\w+", text.casefold()))
        return [len(words.intersection(KEYWORDS.get(c.casefold(), ()))) for c in categories]

    def has_match(self, text: str, allowed: Sequence[str] | None = None) -> bool:
        return any(self._scores(text, allowed if allowed is not None else list(KEYWORDS)))

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        categories = list(dict.fromkeys(allowed if allowed is not None else KEYWORDS))
        if not categories:
            raise ValueError("At least one allowed category is required")
        scores = self._scores(text, categories)
        total = sum(scores)
        candidates = [
            Candidate(category=c, score=s / total if total else 1 / len(categories))
            for c, s in zip(categories, scores, strict=True)
        ]
        candidates.sort(key=lambda candidate: candidate.score, reverse=True)
        return Prediction(
            category=candidates[0].category,
            confidence=candidates[0].score,
            candidates=candidates,
            source="rules",
        )


class ClassifierChain(CategoryClassifier):
    def __init__(
        self,
        model: CategoryClassifier | None = None,
        fallback: CategoryClassifier | None = None,
        gemini: CategoryClassifier | None = None,
        threshold: float = 0.55,
    ) -> None:
        self.model = model
        self.gemini = gemini
        self.threshold = threshold
        self.fallback = fallback or KeywordRuleClassifier()

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        model_prediction = None
        if self.model is not None:
            try:
                prediction = self.model.predict(text, allowed)
                if allowed is None or prediction.category in allowed:
                    model_prediction = prediction
                    if prediction.confidence >= self.threshold:
                        return prediction
            except Exception:
                # An unavailable model must not disable core classification.
                logger.warning("Model unavailable; using rule fallback", exc_info=True)
        if self.gemini is not None:
            try:
                return self.gemini.predict(text, allowed)
            except Exception:
                logger.warning("Gemini classification unavailable; using rules", exc_info=True)
        if model_prediction is not None and not KeywordRuleClassifier().has_match(text, allowed):
            return model_prediction
        return self.fallback.predict(text, allowed)
