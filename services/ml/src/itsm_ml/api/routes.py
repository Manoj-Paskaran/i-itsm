from fastapi import APIRouter, HTTPException, Request

from itsm_ml.classifiers.category import ClassifierChain
from itsm_ml.embeddings.embedder import normalise
from itsm_ml.embeddings.provider import get_embedder
from itsm_ml.risk.estimator import RiskEstimatorChain
from itsm_ml.schemas.models import (
    ClassifyRequest,
    EmbedRequest,
    EmbedResponse,
    ErrorResponse,
    IntakeRequest,
    IntakeResponse,
    Prediction,
    ReportRequest,
    ReportResponse,
    RiskPrediction,
    RiskRequest,
)

router = APIRouter(prefix="/v1", responses={422: {"model": ErrorResponse}})


@router.post("/classify", response_model=Prediction)
def classify(request: ClassifyRequest, http: Request) -> Prediction:
    chain: ClassifierChain = http.app.state.classifier
    return chain.predict(request.text, request.allowed_categories)


@router.post("/sla-risk", response_model=RiskPrediction)
def sla_risk(request: RiskRequest, http: Request) -> RiskPrediction:
    chain: RiskEstimatorChain = http.app.state.risk_estimator
    return chain.predict(request)


@router.post("/embed", response_model=EmbedResponse, responses={503: {"model": ErrorResponse}})
def embed(request: EmbedRequest, http: Request) -> EmbedResponse:
    try:
        backend = get_embedder(http.app.state)
        vectors = normalise(
            backend.embed(request.texts), len(request.texts), http.app.state.settings.embedding_dim
        )
        return EmbedResponse(model=backend.model, dim=backend.dim, vectors=vectors)
    except Exception as exc:
        raise HTTPException(503, detail="Embedding model unavailable or incompatible") from exc


@router.post("/intake", response_model=IntakeResponse, responses={501: {"model": ErrorResponse}})
def intake(request: IntakeRequest) -> IntakeResponse:
    raise HTTPException(501, detail="NOT_IMPLEMENTED")


@router.post(
    "/post-incident-report",
    response_model=ReportResponse,
    responses={501: {"model": ErrorResponse}},
)
def report(request: ReportRequest) -> ReportResponse:
    raise HTTPException(501, detail="NOT_IMPLEMENTED")
