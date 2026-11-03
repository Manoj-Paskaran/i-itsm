"""Optional cached Gemini top-up. Never send real incident data or credentials in output."""

import json
from pathlib import Path

from google import genai
from google.genai import types
from pydantic import BaseModel

from itsm_ml.classifiers.category import KEYWORDS
from itsm_ml.config import Settings


class Ticket(BaseModel):
    text: str
    category: str


def main() -> None:
    settings = Settings()
    if not settings.gemini_api_key or not settings.gemini_model:
        print("BLOCKED: GEMINI_API_KEY and GEMINI_MODEL are required for Gemini top-up")
        return
    target = Path("data/gemini-tickets.jsonl")
    if target.exists():
        print("Using cached Gemini tickets")
        return
    client = genai.Client(api_key=settings.gemini_api_key.get_secret_value())
    rows = []
    # Nine calls, one per label, within a 30-call budget. No retries.
    for category in KEYWORDS:
        result = client.models.generate_content(
            model=settings.gemini_model,
            contents=f"Write 30 varied fictional IT incident tickets for category {category}. "
            "Use only fictional services and no personal data.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=list[Ticket],
                temperature=0,
                seed=42,
            ),
        )
        tickets = [Ticket.model_validate(row) for row in json.loads(result.text or "[]")]
        if any(t.category != category or not t.text.strip() for t in tickets):
            raise ValueError("Gemini top-up category mismatch or empty text")
        rows.extend({**t.model_dump(), "source": settings.gemini_model} for t in tickets)
    target.write_text("".join(json.dumps(row) + "\n" for row in rows))
    print(f"Cached {len(rows)} fictional Gemini tickets")


if __name__ == "__main__":
    main()
