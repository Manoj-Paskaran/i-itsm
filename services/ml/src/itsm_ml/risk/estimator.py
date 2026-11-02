from abc import ABC, abstractmethod
from typing import Literal

from itsm_ml.schemas.models import Priority, RiskPrediction, RiskRequest

# Scaffold heuristics, not authoritative per-service SLA policies.
PRIORITY_TARGET_MINUTES: dict[Priority, int] = {"P1": 60, "P2": 240, "P3": 480, "P4": 1440}


class RiskEstimator(ABC):
    @abstractmethod
    def predict(self, incident: RiskRequest) -> RiskPrediction:
        """Estimate SLA breach risk."""


class RuleBasedRiskEstimator(RiskEstimator):
    def predict(self, incident: RiskRequest) -> RiskPrediction:
        remaining = incident.minutes_to_deadline / PRIORITY_TARGET_MINUTES[incident.priority]
        probability = max(0.0, min(1.0, 1.0 - remaining))
        level: Literal["low", "medium", "high"] = (
            "high" if remaining <= 0.25 else "medium" if remaining <= 0.5 else "low"
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
                pass
        return self.fallback.predict(incident)
