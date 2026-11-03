from collections.abc import Sequence
from typing import Literal

import pytest
from pydantic import ValidationError

from itsm_ml.classifiers.category import CategoryClassifier, ClassifierChain, KeywordRuleClassifier
from itsm_ml.config import Settings
from itsm_ml.risk.estimator import RiskEstimator, RiskEstimatorChain
from itsm_ml.schemas.models import Prediction, RiskPrediction, RiskRequest


class BrokenClassifier(CategoryClassifier):
    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        raise RuntimeError("model offline")


class BrokenRiskEstimator(RiskEstimator):
    def predict(self, incident: RiskRequest) -> RiskPrediction:
        raise RuntimeError("model offline")


def test_classifier_chain_falls_back_on_model_failure() -> None:
    result = ClassifierChain(model=BrokenClassifier()).predict("wifi", ["network"])
    assert result.source == "rules"
    assert result.category == "network"


def test_classifier_chain_uses_available_model() -> None:
    model = KeywordRuleClassifier()
    assert ClassifierChain(model=model).predict("wifi") == model.predict("wifi")


def test_rejects_empty_allowed_categories() -> None:
    with pytest.raises(ValueError, match="At least one"):
        KeywordRuleClassifier().predict("wifi", [])


def test_unknown_text_is_deterministic_and_case_insensitive() -> None:
    classifier = KeywordRuleClassifier()
    assert classifier.predict("unrecognized words").confidence == pytest.approx(1 / 9)
    assert classifier.predict("WIFI", ["Network"]).category == "Network"


def test_risk_chain_falls_back_on_model_failure() -> None:
    request = RiskRequest(
        priority="P1",
        impact=1,
        urgency=1,
        category="network",
        service="payments",
        reassignment_count=0,
        minutes_open=10,
        minutes_to_deadline=1,
    )
    result = RiskEstimatorChain(model=BrokenRiskEstimator()).predict(request)
    assert result.source == "rules"
    assert result.level == "high"


def test_settings_allow_missing_key_and_read_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert Settings().gemini_api_key is None
    monkeypatch.setenv("PORT", "8010")
    monkeypatch.setenv("GEMINI_MODEL", "configured-model")
    monkeypatch.setenv("EMBEDDING_MODEL", "configured-embedder")
    monkeypatch.setenv("ARTIFACTS_DIR", "/tmp/models")
    settings = Settings()
    assert settings.port == 8010
    assert settings.gemini_model == "configured-model"
    assert settings.embedding_model == "configured-embedder"
    assert str(settings.artifacts_dir) == "/tmp/models"
    monkeypatch.setenv("PORT", "0")
    with pytest.raises(ValidationError):
        Settings()


def test_model_failures_are_logged(caplog: pytest.LogCaptureFixture) -> None:
    ClassifierChain(model=BrokenClassifier()).predict("wifi")
    assert "Model unavailable" in caplog.text
    assert "model offline" in caplog.text


def test_health_reports_application_state(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from itsm_ml.main import create_app

    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    app = create_app()
    app.state.classifier.model = KeywordRuleClassifier()
    app.state.embedder = object()
    assert TestClient(app).get("/health").json()["models"] == {
        "classifier": True,
        "slaRisk": False,
        "embedder": True,
        "gemini": True,
    }


def test_risk_uses_actual_thirty_minute_window() -> None:
    from itsm_ml.risk.estimator import RuleBasedRiskEstimator

    for opened, remaining, expected in [
        (10, 20, "low"),
        (15, 15, "medium"),
        (22.5, 7.5, "high"),
        (0, 0, "high"),
    ]:
        req = RiskRequest(
            priority="P1",
            impact=1,
            urgency=1,
            category="network",
            service="payment",
            reassignment_count=0,
            minutes_open=opened,
            minutes_to_deadline=remaining,
        )
        assert RuleBasedRiskEstimator().predict(req).level == expected


class FixedClassifier(CategoryClassifier):
    def __init__(self, source: Literal["model", "gemini", "rules"]) -> None:
        self.result = Prediction(
            category="application", confidence=0.3, candidates=[], source=source
        )

    def predict(self, text: str, allowed: Sequence[str] | None = None) -> Prediction:
        return self.result


def test_keeps_low_confidence_model_answer_when_gemini_fails() -> None:
    model = FixedClassifier("model")
    assert (
        ClassifierChain(model=model, gemini=BrokenClassifier()).predict("payment") == model.result
    )


def test_keeps_low_confidence_model_answer_without_gemini() -> None:
    model = FixedClassifier("model")
    assert ClassifierChain(model=model).predict("payment") == model.result


def test_prefers_keyword_rules_over_low_confidence_model_when_keywords_match() -> None:
    assert ClassifierChain(model=FixedClassifier("model")).predict("wifi").source == "rules"


def test_uses_gemini_when_model_below_threshold() -> None:
    assert (
        ClassifierChain(model=FixedClassifier("model"), gemini=FixedClassifier("gemini"))
        .predict("payment")
        .source
        == "gemini"
    )


def test_falls_back_to_rules_when_model_raises() -> None:
    assert ClassifierChain(model=BrokenClassifier()).predict("payment").source == "rules"
