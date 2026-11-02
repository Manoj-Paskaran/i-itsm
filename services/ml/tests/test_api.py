import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from itsm_ml.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def risk_body(**changes: object) -> dict[str, object]:
    return {
        "priority": "P1",
        "impact": 4,
        "urgency": 4,
        "category": "network",
        "service": "Payment",
        "reassignmentCount": 0,
        "minutesOpen": 10,
        "minutesToDeadline": 30,
        **changes,
    }


def test_health_reports_no_loaded_models(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "health-test"})
    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == "health-test"
    assert response.json() == {
        "status": "ok",
        "models": {"classifier": False, "slaRisk": False, "embedder": False, "gemini": False},
    }


SAMPLES = json.loads((Path(__file__).parents[1] / "data/classification-samples.json").read_text())


@pytest.mark.parametrize("sample", SAMPLES, ids=[s["category"] for s in SAMPLES])
def test_classifies_each_category(client: TestClient, sample: dict[str, str]) -> None:
    response = client.post("/v1/classify", json={"text": sample["text"]})
    assert response.status_code == 200
    body = response.json()
    assert body["category"] == sample["category"]
    assert body["source"] == "rules"
    assert 0 <= body["confidence"] <= 1
    assert sum(c["score"] for c in body["candidates"]) == pytest.approx(1)


@pytest.mark.parametrize("allowed", [["network", "software"], ["Custom category"]])
def test_respects_allowed_categories(client: TestClient, allowed: list[str]) -> None:
    body = client.post(
        "/v1/classify", json={"text": "database SQL query", "allowedCategories": allowed}
    ).json()
    assert body["category"] in allowed
    assert {c["category"] for c in body["candidates"]} <= set(allowed)


@pytest.mark.parametrize("priority,target", [("P1", 60), ("P2", 240), ("P3", 480), ("P4", 1440)])
@pytest.mark.parametrize(
    "ratio,level,probability",
    [
        (-1, "high", 1),
        (0, "high", 1),
        (0.25, "high", 0.75),
        (0.25001, "medium", 0.74999),
        (0.5, "medium", 0.5),
        (0.50001, "low", 0.49999),
        (1, "low", 0),
        (2, "low", 0),
    ],
)
def test_risk_boundaries(
    client: TestClient, priority: str, target: int, ratio: float, level: str, probability: float
) -> None:
    response = client.post(
        "/v1/sla-risk", json=risk_body(priority=priority, minutesToDeadline=ratio * target)
    )
    assert response.status_code == 200
    assert response.json()["level"] == level
    assert response.json()["probability"] == pytest.approx(probability)
    assert response.json()["source"] == "rules"


@pytest.mark.parametrize(
    "path,body",
    [
        ("embed", {"texts": ["example"]}),
        (
            "intake",
            {
                "messages": [{"role": "user", "text": "help"}],
                "services": [{"id": "payments", "name": "Payments"}],
                "categories": [],
            },
        ),
        (
            "post-incident-report",
            {
                "incident": {"id": "i1"},
                "timeline": [
                    {
                        "at": "2026-11-02T00:00:00Z",
                        "actor": "u1",
                        "action": "transition",
                        "from": "NEW",
                        "to": "CLASSIFIED",
                        "note": "classified",
                    }
                ],
            },
        ),
    ],
)
def test_unimplemented_endpoints_validate_and_echo_id(
    client: TestClient,
    path: str,
    body: dict[str, object],
) -> None:
    response = client.post(f"/v1/{path}", json=body, headers={"X-Request-Id": "stub-test"})
    assert response.status_code == 501
    assert response.json() == {"error": {"code": "NOT_IMPLEMENTED", "message": "NOT_IMPLEMENTED"}}
    assert response.headers["X-Request-Id"] == "stub-test"
    invalid = client.post(f"/v1/{path}", json={})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "body", [{}, {"text": ""}, {"text": "   "}, {"text": "x", "allowedCategories": []}]
)
def test_classify_rejects_invalid_input(client: TestClient, body: dict[str, object]) -> None:
    response = client.post("/v1/classify", json=body)
    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "Request does not match the HTTP contract"}
    }
    assert response.headers["X-Request-Id"]


@pytest.mark.parametrize(
    "changes",
    [
        {"impact": 0},
        {"urgency": 5},
        {"impact": True},
        {"priority": "P5"},
        {"reassignmentCount": -1},
        {"minutesOpen": -1},
    ],
)
def test_risk_rejects_invalid_input(client: TestClient, changes: dict[str, object]) -> None:
    response = client.post("/v1/sla-risk", json=risk_body(**changes))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_http_errors_use_uniform_shape(client: TestClient) -> None:
    for response in [client.get("/missing"), client.get("/v1/classify")]:
        assert response.status_code in (404, 405)
        assert response.json()["error"]["code"] == f"HTTP_{response.status_code}"
        assert response.headers["X-Request-Id"]
    malformed = client.post(
        "/v1/classify", content="{", headers={"Content-Type": "application/json"}
    )
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unexpected_error_is_sanitized_and_echoes_id(client: TestClient) -> None:
    app = create_app()

    @app.get("/test-error")
    def fail() -> None:
        raise RuntimeError("sensitive details")

    response = TestClient(app).get("/test-error", headers={"X-Request-Id": "failure"})
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}
    }
    assert response.headers["X-Request-Id"] == "failure"


def test_openapi_includes_camel_case_contracts(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "allowedCategories" in schemas["ClassifyRequest"]["properties"]
    assert "minutesToDeadline" in schemas["RiskRequest"]["properties"]
    assert "serviceId" in schemas["IncidentDraft"]["properties"]
    assert "from" in schemas["TimelineEntry"]["properties"]
