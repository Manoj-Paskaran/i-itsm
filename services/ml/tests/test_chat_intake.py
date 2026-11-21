import asyncio
import json
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from google import genai
from google.genai import types

from itsm_ml.genai.chat_intake import (
    CachedFirstMessageReader,
    CacheEntry,
    FallbackFirstMessageReader,
    GeminiFirstMessageReader,
    RawFirstMessageReading,
    cache_key,
    load_chat_intake_fixture,
)
from itsm_ml.genai.gateway import ResilientGateway
from itsm_ml.main import create_app
from itsm_ml.schemas.models import ChatIntakeRequest, ChatIntakeResponse, Service

LIVE_MESSAGE = "Card payments are failing in our store"
LIVE_READING: dict[str, Any] = {
    "serviceName": {"value": "payment gateway", "confidence": 0.9},
    "categoryCode": {"value": "APPLICATION", "confidence": 0.8},
    "impact": {"value": 4, "confidence": 0.95},
    "urgency": {"value": 4, "confidence": 0.7},
    "affectedUsers": None,
    "title": "Card payments failing",
    "summary": "In-store card payments are failing.",
    "reply": "Sounds like card payments are failing in your store.",
}


@dataclass
class FakeModel:
    reader: GeminiFirstMessageReader
    call: AsyncMock


def fake_model(model: str, **overrides: Any) -> FakeModel:
    client = MagicMock()
    call = AsyncMock(return_value=MagicMock(text=json.dumps(LIVE_READING | overrides)))
    client.aio.models.generate_content = call
    return FakeModel(GeminiFirstMessageReader("test-only", model, 1, client), call)


def request(message: str = LIVE_MESSAGE, service_id: str = "payment-id") -> ChatIntakeRequest:
    return ChatIntakeRequest(
        message=message,
        services=[Service(id=service_id, name="Payment Gateway")],
        categories=["application", "authentication"],
    )


def cached_reader(
    *models: FakeModel,
    fixture: list[CacheEntry] | None = None,
    timeout: float = 1,
    replay_ms: int = 0,
) -> CachedFirstMessageReader:
    readers = [model.reader for model in models]
    chain = FallbackFirstMessageReader(readers, ResilientGateway(timeout, backoff=0))
    return CachedFirstMessageReader(
        chain, [reader.model for reader in readers], fixture or [], replay_ms
    )


def test_cache_hit_replays_without_calling_gemini(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    entry = load_chat_intake_fixture()[0]
    model = fake_model(entry.model)
    reader = cached_reader(model, fixture=[entry], replay_ms=1200)
    sleep = AsyncMock()
    monkeypatch.setattr("itsm_ml.genai.chat_intake.asyncio.sleep", sleep)
    monkeypatch.setattr("itsm_ml.genai.chat_intake.random.uniform", lambda a, b: 100)
    caplog.set_level("INFO", logger="uvicorn.error.chat_intake")
    result = asyncio.run(reader.read(request(entry.message)))
    assert result.engine == "cache" and result.model == entry.model
    assert result.title == entry.reading.title
    assert caplog.messages[-2:] == [
        f"chat-intake replaying a {entry.captured_by} fixture reading",
        f"chat-intake engine=cache model={entry.model} service=Payment Gateway",
    ]
    sleep.assert_awaited_once_with(1.3)
    model.call.assert_not_called()


def test_cache_key_ignores_case_and_punctuation() -> None:
    assert cache_key("  It ISN’T \tworking?!  ", "a") == cache_key("it isn't working", "a")
    assert cache_key("it isn't working", "a") != cache_key("it isn't working", "b")


def test_cache_maps_service_name_to_current_id() -> None:
    entry = load_chat_intake_fixture()[0]
    reader = cached_reader(fixture=[entry])
    for service_id in ("before-seed", "after-seed"):
        result = asyncio.run(reader.read(request(entry.message, service_id)))
        assert result.fields.service_id is not None
        assert result.fields.service_id.value == service_id


def test_cache_looks_up_configured_models_in_primary_then_fallback_order() -> None:
    original = load_chat_intake_fixture()[0]
    primary, fallback = fake_model("primary"), fake_model("fallback")
    primary_entry = original.model_copy(update={"model": "primary"})
    fallback_entry = original.model_copy(update={"model": "fallback"})
    for entries, expected in (
        ([fallback_entry, primary_entry], "primary"),
        ([original, fallback_entry], "fallback"),
    ):
        reader = cached_reader(primary, fallback, fixture=entries)
        result = asyncio.run(reader.read(request(original.message)))
        assert result.engine == "cache" and result.model == expected
    primary.call.assert_not_called()
    fallback.call.assert_not_called()


def test_cache_ignores_fixtures_for_old_prompt_versions() -> None:
    old_entry = load_chat_intake_fixture()[0].model_dump(by_alias=True)
    old_entry["promptVersion"] = "chat-intake-v1"
    del old_entry["reading"]["categoryCode"]
    entry = CacheEntry.model_validate(old_entry)
    result = asyncio.run(cached_reader(fixture=[entry]).read(request(entry.message)))
    assert result.engine == "rules"


def test_cache_serves_fixture_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_INTAKE_REPLAY_MS", "0")
    monkeypatch.setenv("GEMINI_MODEL", "configured-but-no-key")
    with TestClient(create_app()) as client:
        for entry in load_chat_intake_fixture():
            response = client.post(
                "/v1/chat-intake", json=request(entry.message).model_dump(by_alias=True)
            )
            assert response.status_code == 200
            result = ChatIntakeResponse.model_validate(response.json())
            assert result.engine == "cache" and result.model == entry.model
            assert result.fields.affected_users is None
            assert response.json()["fields"]["serviceId"]["value"] == "payment-id"
            assert response.json()["fields"]["categoryCode"] == {
                "value": "application",
                "confidence": 0.8,
            }


def test_falls_back_to_fallback_model_on_503() -> None:
    class Unavailable(Exception):
        code = 503

    primary, fallback = fake_model("primary"), fake_model("fallback")
    primary.call.side_effect = Unavailable()
    reader = cached_reader(primary, fallback)
    result = asyncio.run(reader.read(request()))
    assert result.engine == "gemini" and result.model == "fallback"
    assert primary.call.await_count == 3
    fallback.call.assert_awaited_once()


def test_falls_back_to_fallback_model_when_retry_delay_exceeds_model_budget() -> None:
    class RateLimited(Exception):
        code = 429
        details = {
            "error": {
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "30s"}
                ]
            }
        }

    primary, fallback = fake_model("primary"), fake_model("fallback")
    primary.call.side_effect = RateLimited()
    reader = cached_reader(primary, fallback)
    result = asyncio.run(reader.read(request()))
    assert result.model == "fallback"
    primary.call.assert_awaited_once()
    fallback.call.assert_awaited_once()


def test_falls_back_to_rules_when_gemini_times_out() -> None:
    async def slow(**_: Any) -> None:
        await asyncio.sleep(0.1)

    model = fake_model("primary")
    model.call.side_effect = slow
    result = asyncio.run(cached_reader(model, timeout=0.01).read(request()))
    assert result.engine == "rules" and result.title is None
    model.call.assert_awaited_once()


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": " "},
        {"title": "x" * 81},
        {"reply": ""},
        {"reply": "x" * 201},
        {"reply": "Can you tell me more?"},
        {"summary": ""},
        {"serviceName": {"value": "Payment Gateway", "confidence": 1.5}},
        {"urgency": {"value": 4, "confidence": -0.01}},
        {"impact": {"value": 5, "confidence": 0.9}},
        {"affectedUsers": {"value": 0, "confidence": 0.9}},
    ],
)
def test_falls_back_to_rules_on_malformed_answer(overrides: dict[str, Any]) -> None:
    model = fake_model("primary", **overrides)
    result = asyncio.run(cached_reader(model).read(request()))
    assert result.engine == "rules"
    assert result.model is result.title is result.summary is result.reply is None
    assert all(field is None for field in result.fields.model_dump().values())


def test_falls_back_to_fallback_model_on_invalid_json() -> None:
    primary, fallback = fake_model("primary"), fake_model("fallback")
    primary.call.return_value = MagicMock(text="not JSON")
    result = asyncio.run(cached_reader(primary, fallback).read(request()))
    assert result.engine == "gemini" and result.model == "fallback"


def test_unknown_service_name_becomes_null() -> None:
    model = fake_model("primary", serviceName={"value": "Payment", "confidence": 0.9})
    result = asyncio.run(cached_reader(model).read(request()))
    assert result.engine == "gemini"
    assert result.fields.service_id is None
    assert result.fields.impact is not None


def test_resolves_category_code_case_insensitively() -> None:
    model = fake_model("primary")
    result = asyncio.run(cached_reader(model).read(request()))
    assert result.fields.category_code is not None
    assert result.fields.category_code.value == "application"
    assert result.fields.category_code.confidence == 0.8


@pytest.mark.parametrize("categories", [None, [], ["authentication"]])
def test_category_outside_current_catalog_becomes_null(categories: list[str] | None) -> None:
    model = fake_model("primary")
    req = request().model_copy(update={"categories": categories})
    result = asyncio.run(cached_reader(model).read(req))
    assert result.engine == "gemini"
    assert result.fields.category_code is None


def test_rules_answers_are_not_cached() -> None:
    model = fake_model("primary")
    model.call.side_effect = [ValueError(), MagicMock(text=json.dumps(LIVE_READING))]
    reader = cached_reader(model)
    assert asyncio.run(reader.read(request())).engine == "rules"
    assert asyncio.run(reader.read(request())).engine == "gemini"
    assert model.call.await_count == 2


def test_live_answer_is_cached_for_next_call() -> None:
    model = fake_model("primary")
    reader = cached_reader(model)
    first = asyncio.run(reader.read(request()))
    second = asyncio.run(reader.read(request(service_id="after-seed")))
    assert first.engine == "gemini" and second.engine == "cache"
    assert second.model == "primary"
    assert second.fields.service_id is not None and second.fields.service_id.value == "after-seed"
    model.call.assert_awaited_once()


def test_gemini_makes_one_structured_call_using_service_names() -> None:
    bodies: list[dict[str, Any]] = []

    def handle(http_request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(http_request.content))
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(LIVE_READING)}]}}]},
        )

    async def read() -> ChatIntakeResponse:
        client = genai.Client(
            api_key="test-only",
            http_options=types.HttpOptions(
                async_client_args={"transport": httpx.MockTransport(handle)}
            ),
        )
        async with client.aio:
            return await GeminiFirstMessageReader("test-only", "test-model", 1, client).read(
                request()
            )

    result = asyncio.run(read())
    assert result.engine == "gemini"
    (body,) = bodies
    assert json.loads(body["contents"][0]["parts"][0]["text"]) == {
        "message": LIVE_MESSAGE,
        "services": ["Payment Gateway"],
        "categories": ["application", "authentication"],
    }
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    schema = body["generationConfig"]["responseSchema"]
    assert (
        schema["properties"].keys()
        == RawFirstMessageReading.model_json_schema()["properties"].keys()
    )
    assert "tools" not in body


def test_endpoint_returns_rules_without_key_for_unknown_message() -> None:
    with TestClient(create_app()) as client:
        response = client.post("/v1/chat-intake", json=request().model_dump(by_alias=True))
    assert response.status_code == 200
    assert response.json() == {
        "engine": "rules",
        "model": None,
        "reply": None,
        "title": None,
        "summary": None,
        "fields": {
            "serviceId": None,
            "categoryCode": None,
            "impact": None,
            "urgency": None,
            "affectedUsers": None,
        },
    }


@pytest.mark.parametrize("message", [" ", "x" * 2001])
def test_endpoint_rejects_blank_or_oversized_messages(message: str) -> None:
    with TestClient(create_app()) as client:
        response = client.post("/v1/chat-intake", json={"message": message, "services": []})
    assert response.status_code == 422


def test_cache_serves_fixture_recorded_with_an_unconfigured_model_before_calling_gemini() -> None:
    entry = load_chat_intake_fixture()[0]
    primary = fake_model("some-other-model")
    result = asyncio.run(cached_reader(primary, fixture=[entry]).read(request(entry.message)))
    assert result.engine == "cache" and result.model == entry.model
    primary.call.assert_not_called()


def test_fixture_can_be_switched_off_to_try_a_live_call() -> None:
    entry = load_chat_intake_fixture()[0]
    primary = fake_model("primary")
    readers = [primary.reader]
    chain = FallbackFirstMessageReader(readers, ResilientGateway(1, backoff=0))
    reader = CachedFirstMessageReader(chain, ["primary"], [entry], 0, use_fixture=False)
    result = asyncio.run(reader.read(request(entry.message)))
    assert result.engine == "gemini"
    primary.call.assert_called_once()


def test_trailing_question_in_reply_is_dropped_not_rejected() -> None:
    model = fake_model("primary", reply="Sounds like card payments are failing. Is that right?")
    result = asyncio.run(cached_reader(model).read(request()))
    assert result.engine == "gemini"
    assert result.reply == "Sounds like card payments are failing."


def test_gemini_schema_has_no_additional_properties_patterns_or_bounds() -> None:
    from itsm_ml.genai.chat_intake import GeminiReadingSchema

    text = json.dumps(GeminiReadingSchema.model_json_schema())
    for keyword in ("additionalProperties", "pattern", "minLength", "maxLength", "minimum"):
        assert keyword not in text
