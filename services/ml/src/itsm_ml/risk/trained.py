from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np

from itsm_ml.risk.estimator import RiskEstimator
from itsm_ml.risk.features import feature_row
from itsm_ml.schemas.models import RiskPrediction, RiskRequest


class TrainedRiskEstimator(RiskEstimator):
    def __init__(self, path: Path) -> None:
        bundle: dict[str, Any] = joblib.load(path)
        self.estimator = bundle["estimator"]
        self.metadata = bundle["metadata"]

    def predict(self, incident: RiskRequest) -> RiskPrediction:
        if incident.minutes_to_deadline <= 0:
            probability = 1.0
        else:
            classes = list(self.estimator.classes_)
            probability = float(
                self.estimator.predict_proba(feature_row(incident))[0][classes.index(1)]
            )
        if not np.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("Risk model returned an invalid probability")
        level: Literal["low", "medium", "high"] = (
            "high" if probability >= 0.75 else "medium" if probability >= 0.5 else "low"
        )
        return RiskPrediction(probability=probability, level=level, source="model")
