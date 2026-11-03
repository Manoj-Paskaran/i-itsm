from pathlib import Path
from unittest.mock import MagicMock

import joblib
import pytest

from itsm_ml.risk.estimator import RiskEstimatorChain
from itsm_ml.risk.features import feature_row
from itsm_ml.risk.trained import TrainedRiskEstimator
from itsm_ml.schemas.models import RiskRequest


def request(remaining: float = 10) -> RiskRequest:
    return RiskRequest(
        priority="P1",
        impact=4,
        urgency=2,
        category="network",
        service="pay",
        reassignment_count=1,
        minutes_open=20,
        minutes_to_deadline=remaining,
    )


def test_features_match_serving_contract() -> None:
    row = feature_row(request())[0]
    assert row.tolist() == pytest.approx([4, 2, 1, 1, 20, 20 / 30])


def test_trained_risk_and_breach_override(tmp_path: Path) -> None:
    model = MagicMock()
    model.classes_ = [0, 1]
    model.predict_proba.return_value = [[0.2, 0.8]]
    path = tmp_path / "risk.joblib"
    # Inject the estimator after loading a minimal trusted fixture bundle.
    joblib.dump({"estimator": None, "metadata": {}}, path)
    estimator = TrainedRiskEstimator(path)
    estimator.estimator = model
    assert estimator.predict(request()).probability == 0.8
    assert estimator.predict(request(-1)).probability == 1
    model.predict_proba.assert_called_once()
    assert RiskEstimatorChain(model=estimator).predict(request(0)).probability == 1
    model.predict_proba.return_value = [[0, float("nan")]]
    assert RiskEstimatorChain(model=estimator).predict(request()).source == "rules"


def test_snapshot_features_ignore_closure_information() -> None:
    import pandas as pd

    from itsm_ml.risk.dataset import prepare
    from itsm_ml.risk.features import FEATURE_NAMES

    row = {
        "number": "i1",
        "incident_state": "Active",
        "opened_at": "01/02/2016 00:00",
        "sys_updated_at": "01/02/2016 00:10",
        "impact": "1 - High",
        "urgency": "2 - Medium",
        "priority": "1 - Critical",
        "reassignment_count": "1",
        "made_sla": "false",
        "closed_at": "future",
        "resolved_at": "future",
        "closed_code": "secret",
    }
    before = prepare(pd.DataFrame([row]))
    after = prepare(pd.DataFrame([{**row, "closed_at": "changed", "closed_code": "other"}]))
    assert before[FEATURE_NAMES].equals(after[FEATURE_NAMES])
    assert before.minutesOpen.iloc[0] == 10
    assert before.breach.iloc[0] == 1
    assert prepare(pd.DataFrame([{**row, "incident_state": "Closed"}])).empty


def test_incident_groups_never_cross_splits() -> None:
    import pandas as pd

    from itsm_ml.risk.dataset import split_snapshots

    rows = [
        {"number": f"incident-{i}", "breach": i % 2, "snapshot": j}
        for i in range(50)
        for j in range(3)
    ]
    train, validation, test = split_snapshots(pd.DataFrame(rows))
    groups = [set(part.number) for part in (train, validation, test)]
    assert not groups[0] & groups[1]
    assert not groups[0] & groups[2]
    assert not groups[1] & groups[2]
    assert len(train) + len(validation) + len(test) == len(rows)


def test_eventual_outcome_is_label_only() -> None:
    import pandas as pd

    from itsm_ml.risk.dataset import prepare

    open_row = {
        "number": "i1",
        "incident_state": "New",
        "opened_at": "01/02/2016 00:00",
        "sys_updated_at": "01/02/2016 00:10",
        "impact": "1 - High",
        "urgency": "1 - High",
        "priority": "1 - Critical",
        "reassignment_count": "0",
        "made_sla": "true",
    }
    closed = {
        **open_row,
        "incident_state": "Closed",
        "made_sla": "false",
        "sys_updated_at": "05/02/2016 00:00",
    }
    snapshots = prepare(pd.DataFrame([open_row, closed]))
    assert len(snapshots) == 1
    assert snapshots.breach.iloc[0] == 1
    assert snapshots.minutesOpen.iloc[0] == 10


def saved_estimator() -> TrainedRiskEstimator:
    path = Path(__file__).resolve().parents[1] / "artifacts" / "sla_risk.joblib"
    if not path.is_file():
        pytest.skip("SLA risk artifact is missing")
    return TrainedRiskEstimator(path)


def test_saved_artifact_risk_never_falls_within_the_sla_window() -> None:
    from itsm_ml.risk.features import RESOLUTION_TARGETS
    from itsm_ml.risk.monotonicity import is_non_decreasing, window_curve

    estimator = saved_estimator()
    for priority in RESOLUTION_TARGETS:
        curve = window_curve(estimator.estimator, priority, [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95])
        assert is_non_decreasing(curve), f"{priority}: {curve}"


def test_fresh_p1_is_not_flagged_high_by_the_model() -> None:
    incident = request().model_copy(
        update={
            "impact": 4,
            "urgency": 4,
            "reassignment_count": 0,
            "minutes_open": 1.5,
            "minutes_to_deadline": 28.5,
        }
    )
    assert saved_estimator().predict(incident).level != "high"


@pytest.mark.parametrize(
    ("values", "expected"),
    [([], True), ([1], True), ([1, 1, 2], True), ([1, 0.9], False), ([1, 1 - 1e-10], True)],
)
def test_is_non_decreasing(values: list[float], expected: bool) -> None:
    from itsm_ml.risk.monotonicity import is_non_decreasing

    assert is_non_decreasing(values) is expected


def test_elapsed_fraction_is_clipped_in_training_and_serving() -> None:
    import pandas as pd

    from itsm_ml.risk.dataset import prepare

    incident = request().model_copy(update={"minutes_open": 300})
    assert feature_row(incident)[0][-1] == 2
    row = {
        "number": "i",
        "incident_state": "Active",
        "opened_at": "01/02/2016 00:00",
        "sys_updated_at": "01/02/2016 05:00",
        "impact": "1",
        "urgency": "1",
        "priority": "1",
        "reassignment_count": "0",
        "made_sla": "true",
    }
    prepared = prepare(pd.DataFrame([row]))
    assert prepared.elapsedFractionRaw.iloc[0] == 10
    assert prepared.elapsedFraction.iloc[0] == 2


@pytest.mark.parametrize(("engine", "source"), [("rules", "rules"), ("model", "model")])
def test_risk_engine_selection(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, engine: str, source: str
) -> None:
    from fastapi.testclient import TestClient

    from itsm_ml.main import create_app
    from itsm_ml.schemas.models import RiskPrediction

    (tmp_path / "sla_risk.joblib").touch()
    fake = MagicMock()
    fake.predict.return_value = RiskPrediction(probability=0.2, level="low", source="model")
    monkeypatch.setattr("itsm_ml.main.TrainedRiskEstimator", lambda path: fake)
    if engine == "model":
        monkeypatch.setenv("SLA_RISK_ENGINE", "model")
    else:
        monkeypatch.delenv("SLA_RISK_ENGINE", raising=False)
    client = TestClient(create_app())
    assert client.get("/health").json()["models"]["slaRisk"] is True
    assert (
        client.post("/v1/sla-risk", json=request().model_dump(by_alias=True)).json()["source"]
        == source
    )
