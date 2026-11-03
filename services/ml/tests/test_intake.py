import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from google.genai import types

from itsm_ml.classifiers.category import ClassifierChain
from itsm_ml.genai.gateway import ResilientGateway, retry_delay_seconds
from itsm_ml.genai.intake import AdkIntakeAgent, RuleBasedIntakeAgent, validate_draft
from itsm_ml.genai.report import GeminiReportAgent, RuleBasedReportAgent
from itsm_ml.main import create_app
from itsm_ml.schemas.models import IntakeRequest, ReportRequest, ReportResponse


def intake_request(texts: list[str]) -> IntakeRequest:
    return IntakeRequest.model_validate(
        {
            "messages": [{"role": "user", "text": text} for text in texts],
            "services": [{"id": "pay", "name": "Payment"}],
            "categories": ["application", "network"],
        }
    )


def test_rule_intake_three_turns_and_missing_fields() -> None:
    agent = RuleBasedIntakeAgent(ClassifierChain())
    texts = ["Payment unavailable", "It affects everyone", "50 users affected, urgent"]
    first = asyncio.run(agent.intake(intake_request(texts[:1])))
    second = asyncio.run(agent.intake(intake_request(texts[:2])))
    third = asyncio.run(agent.intake(intake_request(texts)))
    assert not first.done and not second.done and third.done
    assert "affectedUsers" in second.missing_fields
    assert third.draft.service_id == "pay"
    assert third.draft.affected_users == 50
    assert third.draft.impact == 4 and third.draft.urgency == 4
    assert third.engine == "rules"


def test_mocked_adk_three_turn_conversation() -> None:
    calls = []

    class FakeRunner:
        def __init__(self, **kwargs: Any) -> None:
            agent = kwargs["agent"]
            assert {tool.__name__ for tool in agent.tools} == {"classify_text", "draft_incident"}
            assert "Payment" in agent.instruction and "application" in agent.instruction
            assert "4 = critical" in agent.instruction and "1 = low" in agent.instruction
            assert "engine" not in agent.output_schema.model_fields

        async def run_async(self, **kwargs: Any) -> Any:
            message = kwargs["new_message"].parts[0].text
            request = IntakeRequest.model_validate_json(message)
            calls.append(len(request.messages))
            response = await RuleBasedIntakeAgent(ClassifierChain()).intake(request)
            event = MagicMock()
            event.is_final_response.return_value = True
            event.content = types.Content(
                parts=[types.Part(text=response.model_dump_json(by_alias=True))]
            )
            yield event

    agent = AdkIntakeAgent(
        ClassifierChain(), "test-only", "test-model", 1, runner_factory=FakeRunner
    )
    texts = ["Payment unavailable", "It affects everyone", "50 users affected, urgent"]
    for length in range(1, 4):
        response = asyncio.run(agent.intake(intake_request(texts[:length])))
        assert response.engine == "gemini"
    assert response.done and response.draft.affected_users == 50
    assert calls == [1, 2, 3]


def test_unknown_gemini_service_is_rejected() -> None:
    request = intake_request(["Payment down for 50 users, urgent"])
    response = asyncio.run(RuleBasedIntakeAgent(ClassifierChain()).intake(request))
    response.draft.service_id = "invented"
    with pytest.raises(ValueError, match="unknown service"):
        validate_draft(response, request)


def test_report_template_does_not_invent_facts() -> None:
    request = ReportRequest.model_validate(
        {
            "incident": {"title": "Payment outage"},
            "timeline": [{"at": "2026-11-03T00:00:00Z", "actor": "user", "action": "reported"}],
        }
    )
    result = asyncio.run(RuleBasedReportAgent().report(request))
    for heading in [
        "Summary",
        "Timeline",
        "Impact",
        "Root cause",
        "Resolution",
        "SLA outcome",
        "Follow-ups",
    ]:
        assert f"## {heading}" in result.markdown
    assert "Not known from supplied facts" in result.markdown
    assert result.engine == "rules"


def test_mocked_gemini_report_returns_structured_output() -> None:
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(
        return_value=MagicMock(text=json.dumps({"markdown": "## Summary\nSupplied facts only"}))
    )
    agent = GeminiReportAgent("test-only", "test-model", 1, client)
    result = asyncio.run(agent.report(ReportRequest(incident={}, timeline=[])))
    assert result.engine == "gemini"
    assert "Summary" in result.markdown


def test_cache_hit_skips_provider_and_protects_stored_value() -> None:
    gateway = ResilientGateway()
    request = ReportRequest(incident={}, timeline=[])
    primary = AsyncMock(return_value=ReportResponse(markdown="original", engine="gemini"))
    fallback = AsyncMock(return_value=ReportResponse(markdown="fallback"))
    first = asyncio.run(gateway.execute("report", request, [primary], fallback))
    first.markdown = "mutated"
    second = asyncio.run(gateway.execute("report", request, [primary], fallback))
    assert second.markdown == "original"
    primary.assert_awaited_once()
    fallback.assert_not_awaited()


def test_rate_limit_retries_then_succeeds() -> None:
    class RateLimited(Exception):
        code = 429

    primary = AsyncMock(side_effect=[RateLimited(), ReportResponse(markdown="ok", engine="gemini")])
    fallback = AsyncMock()
    gateway = ResilientGateway(backoff=0)
    result = asyncio.run(
        gateway.execute("report", ReportRequest(incident={}, timeline=[]), [primary], fallback)
    )
    assert result.engine == "gemini" and primary.await_count == 2
    fallback.assert_not_awaited()


def test_timeout_and_exhausted_quota_fall_back() -> None:
    async def slow() -> ReportResponse:
        await asyncio.sleep(0.1)
        return ReportResponse(markdown="late", engine="gemini")

    fallback = AsyncMock(return_value=ReportResponse(markdown="fallback"))
    gateway = ResilientGateway(timeout=0.001)
    assert (
        asyncio.run(
            gateway.execute("report", ReportRequest(incident={}, timeline=[]), [slow], fallback)
        ).engine
        == "rules"
    )

    class RateLimited(Exception):
        code = 429

    primary = AsyncMock(side_effect=RateLimited())
    gateway = ResilientGateway(retries=2, backoff=0)
    assert (
        asyncio.run(
            gateway.execute("report", ReportRequest(incident={}, timeline=[]), [primary], fallback)
        ).engine
        == "rules"
    )
    assert primary.await_count == 3


def test_lru_cache_is_bounded() -> None:
    gateway = ResilientGateway(cache_size=1)
    fallback = AsyncMock(return_value=ReportResponse(markdown="fallback"))
    for title in ["first", "second", "first"]:
        asyncio.run(
            gateway.execute(
                "report", ReportRequest(incident={"title": title}, timeline=[]), [], fallback
            )
        )
    assert len(gateway.cache) == 1 and fallback.await_count == 3


def test_routes_work_without_key_and_echo_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    client = TestClient(create_app())
    request = intake_request(["Payment down for 50 users. This is urgent."])
    response = client.post(
        "/v1/intake",
        json=request.model_dump(by_alias=True),
        headers={"X-Request-Id": "intake-test"},
    )
    assert response.status_code == 200 and response.json()["engine"] == "rules"
    assert response.json()["done"]
    assert response.headers["X-Request-Id"] == "intake-test"
    report = client.post("/v1/post-incident-report", json={"incident": {}, "timeline": []})
    assert report.status_code == 200 and report.json()["engine"] == "rules"


def test_fallback_answer_is_not_cached_so_gemini_is_retried_next_time() -> None:
    primary = AsyncMock(
        side_effect=[ValueError("bad"), ReportResponse(markdown="ok", engine="gemini")]
    )
    fallback = AsyncMock(return_value=ReportResponse(markdown="fallback"))
    gateway = ResilientGateway()
    request = ReportRequest(incident={}, timeline=[])
    assert asyncio.run(gateway.execute("report", request, [primary], fallback)).engine == "rules"
    assert asyncio.run(gateway.execute("report", request, [primary], fallback)).engine == "gemini"


@pytest.mark.parametrize(("delay", "expected"), [("27s", 27), ("0.5s", 0.5), ("bad", 2), (None, 2)])
def test_retry_delay(delay: str | None, expected: float) -> None:
    class Error(Exception):
        details = {
            "error": {
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay}
                ]
            }
        }

    assert retry_delay_seconds(Error(), 1, 1) == expected
    assert retry_delay_seconds(Exception(), 1, 1) == 2


@pytest.mark.parametrize("code", [429, 503])
def test_models_fallback_and_retry_budget(code: int) -> None:
    class Unavailable(Exception):
        def __init__(self) -> None:
            self.code = code
            self.details = {
                "error": {
                    "details": [
                        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "60s"}
                    ]
                }
            }

    first = AsyncMock(side_effect=Unavailable())
    second = AsyncMock(return_value=ReportResponse(markdown="second", engine="gemini"))
    fallback = AsyncMock(return_value=ReportResponse(markdown="rules"))
    request = ReportRequest(incident={}, timeline=[])
    assert (
        asyncio.run(
            ResilientGateway(timeout=1).execute("report", request, [first, second], fallback)
        ).markdown
        == "second"
    )
    assert first.await_count == 1
    second.side_effect = Unavailable()
    assert (
        asyncio.run(
            ResilientGateway(timeout=1).execute("report", request, [first, second], fallback)
        ).engine
        == "rules"
    )
    assert (
        asyncio.run(ResilientGateway().execute("report", request, [], fallback)).engine == "rules"
    )


def test_hanging_first_model_leaves_time_for_the_fallback_model() -> None:
    async def hangs() -> ReportResponse:
        await asyncio.sleep(10)
        raise AssertionError("unreachable")

    second = AsyncMock(return_value=ReportResponse(markdown="second", engine="gemini"))
    fallback = AsyncMock(return_value=ReportResponse(markdown="rules"))
    request = ReportRequest(incident={}, timeline=[])
    result = asyncio.run(
        ResilientGateway(timeout=0.2).execute("report", request, [hangs, second], fallback)
    )
    assert result.markdown == "second"
    fallback.assert_not_awaited()


def test_rule_intake_reads_not_urgent_as_low_urgency() -> None:
    agent = RuleBasedIntakeAgent(ClassifierChain())
    texts = ["Payment is slow for 2 users, not urgent.", "Payment dates are wrong, it can wait"]
    for text in texts:
        response = asyncio.run(agent.intake(intake_request([text])))
        assert response.draft.urgency == 1


def test_rule_intake_accepts_a_bare_number_and_singular_user() -> None:
    agent = RuleBasedIntakeAgent(ClassifierChain())
    bare = asyncio.run(agent.intake(intake_request(["Payment is unavailable.", "50"])))
    assert bare.draft.affected_users == 50
    single = asyncio.run(agent.intake(intake_request(["Payment fails for 1 user"])))
    assert single.draft.affected_users == 1
