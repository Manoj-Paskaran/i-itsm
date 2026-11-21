"""Replace the two demo readings with one live Gemini result per demo message."""

import asyncio
import json
import os
from datetime import date
from pathlib import Path

from itsm_ml.genai.chat_intake import (
    FIXTURE_FILE,
    PROMPT_VERSION,
    CacheEntry,
    CacheFixture,
    GeminiFirstMessageReader,
)
from itsm_ml.schemas.models import ChatIntakeRequest, Service

SERVICE_NAMES = (
    "Payment Gateway",
    "Customer Database",
    "Single Sign-On",
    "Corporate Email",
    "VPN",
    "Cloud Storage",
    "HR Portal",
    "Employee Laptops",
)
CATEGORY_CODES = [
    "hardware",
    "software",
    "network",
    "database",
    "cloud",
    "security",
    "authentication",
    "application",
    "storage",
]


async def capture(api_key: str, model: str) -> None:
    path = Path(__file__).resolve().parents[1] / FIXTURE_FILE
    fixture = json.loads(path.read_text(encoding="utf-8"))
    messages = dict.fromkeys(
        entry.message for entry in CacheFixture.model_validate(fixture).entries
    )
    reader = GeminiFirstMessageReader(api_key, model, timeout=20)
    services = [Service(id=str(index), name=name) for index, name in enumerate(SERVICE_NAMES, 1)]
    entries = []
    for message in messages:
        result = await reader.read_raw(
            ChatIntakeRequest(message=message, services=services, categories=CATEGORY_CODES)
        )
        assert result.reading is not None
        entries.append(
            CacheEntry(
                message=message,
                model=model,
                prompt_version=PROMPT_VERSION,
                captured_at=date.today().isoformat(),
                captured_by="gemini-live",
                note="Captured with scripts/capture_chat_intake_fixture.py",
                reading=result.reading,
            ).model_dump(by_alias=True)
        )
    fixture["entries"] = entries
    path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Captured {len(entries)} readings with {model} in {path}")


if __name__ == "__main__":
    key, model = os.environ.get("GEMINI_API_KEY"), os.environ.get("GEMINI_MODEL")
    if not key or not model:
        raise SystemExit("Set GEMINI_API_KEY and GEMINI_MODEL in the environment first.")
    try:
        asyncio.run(capture(key, model))
    except Exception as exc:
        raise SystemExit(f"Capture failed ({type(exc).__name__}).") from None
