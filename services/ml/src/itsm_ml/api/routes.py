from fastapi import APIRouter, HTTPException

from itsm_ml.classifiers.category import ClassifierChain
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
classifier = ClassifierChain()
risk_estimator = RiskEstimatorChain()


@router.post("/classify", response_model=Prediction)
def classify(request: ClassifyRequest) -> Prediction:
    return classifier.predict(request.text, request.allowed_categories)


@router.post("/sla-risk", response_model=RiskPrediction)
def sla_risk(request: RiskRequest) -> RiskPrediction:
    return risk_estimator.predict(request)


@router.post("/embed", response_model=EmbedResponse, responses={501: {"model": ErrorResponse}})
def embed(request: EmbedRequest) -> EmbedResponse:
    raise HTTPException(501, detail="NOT_IMPLEMENTED")


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
