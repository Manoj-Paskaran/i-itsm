import numpy as np
from numpy.typing import NDArray

from itsm_ml.schemas.models import Priority, RiskRequest

# Spec page 7 resolution targets, assumed when the anonymised UCI source lacks SLA policy.
RESOLUTION_TARGETS: dict[Priority, int] = {"P1": 30, "P2": 120, "P3": 480, "P4": 1440}
ELAPSED_FRACTION_CAP = 2.0
FEATURE_NAMES = [
    "impact",
    "urgency",
    "priority",
    "reassignmentCount",
    "minutesOpen",
    "elapsedFraction",
]


def feature_row(request: RiskRequest) -> NDArray[np.float64]:
    # Match training's policy assumption; B0 rules still use the actual request window.
    return np.asarray(
        [
            [
                request.impact,
                request.urgency,
                int(request.priority[1:]),
                request.reassignment_count,
                request.minutes_open,
                np.clip(
                    request.minutes_open / RESOLUTION_TARGETS[request.priority],
                    0,
                    ELAPSED_FRACTION_CAP,
                ),
            ]
        ],
        dtype=float,
    )
