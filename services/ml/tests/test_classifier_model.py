from pathlib import Path
from unittest.mock import MagicMock

import joblib
import pytest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from itsm_ml.classifiers.category import ClassifierChain
from itsm_ml.classifiers.trained import TrainedCategoryClassifier
from itsm_ml.genai.classifier import GeminiZeroShotClassifier


@pytest.fixture
def trained(tmp_path: Path) -> TrainedCategoryClassifier:
    model = make_pipeline(TfidfVectorizer(), LogisticRegression(random_state=42))
    model.fit(
        ["wifi network", "network router", "disk storage", "storage volume"],
        ["network", "network", "storage", "storage"],
    )
    path = tmp_path / "classifier.joblib"
    joblib.dump({"estimator": model, "metadata": {}, "kind": "tfidf-logreg"}, path)
    return TrainedCategoryClassifier(path)


def test_model_normalises_allowed_labels(trained: TrainedCategoryClassifier) -> None:
    result = trained.predict("wifi", ["storage"])
    assert result.category == "storage" and result.confidence == 1
    assert result.source == "model"
    with pytest.raises(ValueError, match="No known"):
        trained.predict("wifi", ["custom"])


def test_unknown_categories_and_low_confidence_fall_back(
    trained: TrainedCategoryClassifier,
) -> None:
    assert ClassifierChain(model=trained).predict("wifi", ["custom"]).source == "rules"
    assert ClassifierChain(model=trained, threshold=1).predict("wifi").source == "rules"


def test_gemini_zero_shot_validates_and_falls_back() -> None:
    client = MagicMock()
    client.models.generate_content.return_value.text = '{"category":"network","confidence":0.9}'
    adapter = GeminiZeroShotClassifier("test-only", "test-model", client)
    assert adapter.predict("wifi", ["network"]).source == "gemini"
    client.models.generate_content.return_value.text = '{"category":"other","confidence":0.9}'
    assert ClassifierChain(gemini=adapter).predict("wifi", ["network"]).source == "rules"


def test_generated_dataset_is_reproducible_and_unique() -> None:
    import runpy
    from collections import Counter

    script = Path(__file__).parents[1] / "scripts/generate_synthetic.py"
    generate = runpy.run_path(str(script))["generate"]
    rows = generate()
    assert rows == generate()
    assert len(rows) == 2700
    assert len({row["text"] for row in rows}) == 2700
    assert set(Counter(row["category"] for row in rows).values()) == {300}


def test_corrupt_artifacts_use_rules_and_report_unloaded(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    from fastapi.testclient import TestClient

    from itsm_ml.main import create_app

    for name in ["category_classifier.joblib", "sla_risk.joblib"]:
        (tmp_path / name).write_bytes(b"not-a-model")
    client = TestClient(create_app())
    models = client.get("/health").json()["models"]
    assert not models["classifier"] and not models["slaRisk"]
    assert "artifact unavailable" in caplog.text
