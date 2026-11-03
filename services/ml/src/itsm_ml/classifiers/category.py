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
    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        categories = list(dict.fromkeys(allowed if allowed is not None else KEYWORDS))
        if not categories:
            raise ValueError("At least one allowed category is required")
        words = set(re.findall(r"\w+", text.casefold()))
        scores = [len(words.intersection(KEYWORDS.get(c.casefold(), ()))) for c in categories]
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
        self, model: CategoryClassifier | None = None, fallback: CategoryClassifier | None = None
    ) -> None:
        self.model = model
        self.fallback = fallback or KeywordRuleClassifier()

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        if self.model is not None:
            try:
                prediction = self.model.predict(text, allowed)
                if allowed is None or prediction.category in allowed:
                    return prediction
            except Exception:
                # An unavailable model must not disable core classification.
                logger.warning("Model unavailable; using rule fallback", exc_info=True)
        return self.fallback.predict(text, allowed)
