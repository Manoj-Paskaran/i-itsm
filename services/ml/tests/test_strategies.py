from collections.abc import Sequence

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
        minutes_open=0,
        minutes_to_deadline=0,
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
