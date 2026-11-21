from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Score = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Severity = Annotated[int, Field(ge=1, le=4, strict=True)]
NonNegative = Annotated[int, Field(ge=0, strict=True)]
Text = Annotated[str, Field(min_length=1, pattern=r"\S")]
Source = Literal["model", "gemini", "rules"]
Priority = Literal["P1", "P2", "P3", "P4"]


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ModelStatus(ContractModel):
    classifier: bool = False
    sla_risk: bool = False
    embedder: bool = False
    gemini: bool = False


class HealthResponse(ContractModel):
    status: Literal["ok"] = "ok"
    models: ModelStatus = Field(default_factory=ModelStatus)


class ClassifyRequest(ContractModel):
    text: Text
    allowed_categories: Annotated[list[Text], Field(min_length=1)] | None = None


class Candidate(ContractModel):
    category: str
    score: Score


class Prediction(ContractModel):
    category: str
    confidence: Score
    candidates: list[Candidate]
    source: Source


class EmbedRequest(ContractModel):
    texts: Annotated[list[Text], Field(min_length=1, max_length=64)]


class EmbedResponse(ContractModel):
    model: str
    dim: Annotated[int, Field(gt=0)]
    vectors: list[list[float]]


class RiskRequest(ContractModel):
    priority: Priority
    impact: Severity
    urgency: Severity
    category: Text
    service: Text
    reassignment_count: NonNegative
    minutes_open: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    minutes_to_deadline: Annotated[float, Field(allow_inf_nan=False)]


class RiskPrediction(ContractModel):
    probability: Score
    level: Literal["low", "medium", "high"]
    source: Literal["model", "rules"]


class Message(ContractModel):
    role: Literal["user", "assistant"]
    text: Text


class Service(ContractModel):
    id: Text
    name: Text


class ChatIntakeRequest(ContractModel):
    message: Annotated[Text, Field(max_length=2000)]
    services: list[Service]
    categories: list[Text] | None = None


class ChatIntakeGuess[T](ContractModel):
    value: T
    confidence: Annotated[Score, Field(strict=True)]


AffectedUserCount = Annotated[int, Field(ge=1, le=1_000_000, strict=True)]
ChatIntakeEngine = Literal["gemini", "cache", "rules"]


class ChatIntakeFields(ContractModel):
    service_id: ChatIntakeGuess[Text] | None = None
    category_code: ChatIntakeGuess[Text] | None = None
    impact: ChatIntakeGuess[Severity] | None = None
    urgency: ChatIntakeGuess[Severity] | None = None
    affected_users: ChatIntakeGuess[AffectedUserCount] | None = None


class ChatIntakeResponse(ContractModel):
    engine: ChatIntakeEngine
    model: str | None = None
    reply: str | None = None
    title: str | None = None
    summary: str | None = None
    fields: ChatIntakeFields = Field(default_factory=ChatIntakeFields)


class IntakeRequest(ContractModel):
    messages: Annotated[list[Message], Field(min_length=1)]
    services: list[Service]
    categories: list[Text]


class IncidentDraft(ContractModel):
    title: str
    description: str
    service_id: str | None = None
    category: str | None = None
    impact: Severity | None = None
    urgency: Severity | None = None
    affected_users: NonNegative | None = None


class IntakeResponse(ContractModel):
    engine: Literal["gemini", "rules"] = "rules"
    draft: IncidentDraft
    missing_fields: list[str]
    reply: str
    done: bool


class TimelineEntry(ContractModel):
    at: Text
    actor: Text
    action: Text
    from_state: str | None = Field(default=None, alias="from")
    to: str | None = None
    note: str | None = None


class ReportRequest(ContractModel):
    # Incident structure is deliberately open in HTTP contract v1.
    incident: dict[str, Any]
    timeline: list[TimelineEntry]


class ReportResponse(ContractModel):
    engine: Literal["gemini", "rules"] = "rules"
    markdown: str


class ErrorDetail(ContractModel):
    code: str
    message: str


class ErrorResponse(ContractModel):
    error: ErrorDetail
