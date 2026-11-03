from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import numpy as np
import pytest
from fastapi.testclient import TestClient

from itsm_ml.embeddings.embedder import Embedder, FastEmbedEmbedder, GeminiEmbedder, normalise
from itsm_ml.embeddings.provider import get_embedder
from itsm_ml.main import create_app


class FakeEmbedder(Embedder):
    model = "fake"
    dim = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[1.0] + [0.0] * 383 for _ in texts]


def test_embed_contract_and_batch_limit() -> None:
    app = create_app()
    app.state.embedder = FakeEmbedder()
    client = TestClient(app)
    body = client.post("/v1/embed", json={"texts": ["one", "two"]}).json()
    assert body["model"] == "fake" and body["dim"] == 384
    assert len(body["vectors"]) == 2
    assert len(body["vectors"][0]) == 384
    assert client.post("/v1/embed", json={"texts": ["x"] * 65}).status_code == 422
    assert client.get("/health").json()["models"]["embedder"]


@pytest.mark.parametrize("vectors", [[[0.0] * 384], [[1.0]], [[float("nan")] * 384]])
def test_rejects_incompatible_vectors(vectors: list[list[float]]) -> None:
    with pytest.raises(ValueError):
        normalise(vectors, 1, 384)


def test_lazy_initialization_happens_once(monkeypatch: pytest.MonkeyPatch) -> None:
    factory = MagicMock(return_value=FakeEmbedder())
    monkeypatch.setattr("itsm_ml.embeddings.provider.FastEmbedEmbedder", factory)
    app = create_app()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: get_embedder(app.state), range(8)))
    assert all(item is results[0] for item in results)
    factory.assert_called_once()


def test_gemini_dimension_mismatch_is_rejected() -> None:
    client = MagicMock()
    client.models.embed_content.return_value.embeddings = [MagicMock(values=[1.0, 2.0])]
    with pytest.raises(ValueError, match="dimension"):
        GeminiEmbedder("test-only", "test-model", client=client).embed(["x"])


def test_embedding_failure_has_uniform_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("itsm_ml.api.routes.get_embedder", MagicMock(side_effect=ValueError("bad")))
    response = TestClient(create_app()).post("/v1/embed", json={"texts": ["x"]})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "HTTP_503"


@pytest.mark.slow
def test_real_paraphrase_similarity() -> None:
    backend = FastEmbedEmbedder()
    vectors = np.asarray(
        backend.embed(
            [
                "Payment application unavailable",
                "Unable to make payment",
                "My keyboard has a broken key",
            ]
        )
    )
    assert vectors.shape == (3, 384)
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1)
    assert vectors[0] @ vectors[1] > vectors[0] @ vectors[2]
