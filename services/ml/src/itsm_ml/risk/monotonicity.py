from collections.abc import Iterable
from typing import Any

from itsm_ml.risk.features import RESOLUTION_TARGETS, feature_row
from itsm_ml.schemas.models import Priority, RiskRequest


def window_curve(estimator: Any, priority: Priority, fractions: Iterable[float]) -> list[float]:
    target = RESOLUTION_TARGETS[priority]
    severity = {"P1": 4, "P2": 3, "P3": 2, "P4": 1}[priority]
    probabilities = []
    for fraction in fractions:
        request = RiskRequest(
            priority=priority,
            impact=severity,
            urgency=severity,
            category="network",
            service="pay",
            reassignment_count=0,
            minutes_open=fraction * target,
            minutes_to_deadline=(1 - fraction if fraction != 1 else 0.0001) * target,
        )
        probabilities.append(
            float(
                estimator.predict_proba(feature_row(request))[0][list(estimator.classes_).index(1)]
            )
        )
    return probabilities


def is_non_decreasing(values: Iterable[float], tolerance: float = 1e-9) -> bool:
    points = list(values)
    return all(b + tolerance >= a for a, b in zip(points, points[1:]))
