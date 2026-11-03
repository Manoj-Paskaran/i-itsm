import logging
from abc import ABC, abstractmethod
from typing import Literal

from itsm_ml.schemas.models import RiskPrediction, RiskRequest

logger = logging.getLogger(__name__)


class RiskEstimator(ABC):
    @abstractmethod
    def predict(self, incident: RiskRequest) -> RiskPrediction:
        """Estimate SLA breach risk."""


class RuleBasedRiskEstimator(RiskEstimator):
    def predict(self, incident: RiskRequest) -> RiskPrediction:
        window = incident.minutes_open + incident.minutes_to_deadline
        probability = (
            1.0
            if incident.minutes_to_deadline <= 0 or window <= 0
            else min(1.0, incident.minutes_open / window)
        )
        level: Literal["low", "medium", "high"] = (
            "high" if probability >= 0.75 else "medium" if probability >= 0.5 else "low"
        )
        return RiskPrediction(probability=probability, level=level, source="rules")


class RiskEstimatorChain(RiskEstimator):
    def __init__(
        self, model: RiskEstimator | None = None, fallback: RiskEstimator | None = None
    ) -> None:
        self.model = model
        self.fallback = fallback or RuleBasedRiskEstimator()

    def predict(self, incident: RiskRequest) -> RiskPrediction:
        if self.model is not None:
            try:
                return self.model.predict(incident)
            except Exception:
                logger.warning("Model unavailable; using rule fallback", exc_info=True)
        return self.fallback.predict(incident)
