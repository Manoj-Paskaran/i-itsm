"""Optional live smoke: fictional data only; never prints credentials."""

import asyncio
import sys

from itsm_ml.config import Settings
from itsm_ml.main import create_app
from itsm_ml.schemas.models import IntakeRequest, ReportRequest


async def main() -> None:
    settings = Settings()
    if not settings.gemini_api_key or not settings.gemini_model:
        print("BLOCKED: live Gemini checks require GEMINI_API_KEY and GEMINI_MODEL")
        sys.exit(1)
    state = create_app().state
    intake = IntakeRequest.model_validate(
        {
            "messages": [
                {
                    "role": "user",
                    "text": "Payment is down for all users, 50 users affected. This is urgent.",
                }
            ],
            "services": [{"id": "pay", "name": "Payment"}],
            "categories": ["application"],
        }
    )
    report = ReportRequest.model_validate(
        {
            "incident": {
                "title": "Payment outage",
                "resolution": "Restarted the fictional service",
                "slaOutcome": "Met",
            },
            "timeline": [{"at": "2026-11-03T00:00:00Z", "actor": "demo", "action": "resolved"}],
        }
    )

    async def run(kind: str, request: IntakeRequest | ReportRequest) -> None:
        agents = state.intake_agents if kind == "intake" else state.report_agents
        fallback = state.intake_fallback if kind == "intake" else state.report_fallback
        method = "intake" if kind == "intake" else "report"
        answered = "rules"

        async def call(agent: object) -> object:
            nonlocal answered
            result = await getattr(agent, method)(request)
            answered = getattr(agent, "model")
            return result

        result = await state.ai_gateway.execute(
            kind,
            request,
            [lambda a=a: call(a) for a in agents],
            lambda: getattr(fallback, method)(request),
        )
        print(f"{kind}: engine={result.engine}, model={answered}")
        if result.engine == "rules":
            sys.exit(1)

    await run("intake", intake)
    await run("report", report)


if __name__ == "__main__":
    asyncio.run(main())
