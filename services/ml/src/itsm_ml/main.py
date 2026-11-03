import logging
import threading
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from itsm_ml.api.routes import router
from itsm_ml.classifiers.category import ClassifierChain
from itsm_ml.config import Settings
from itsm_ml.risk.estimator import RiskEstimatorChain
from itsm_ml.schemas.models import ErrorDetail, ErrorResponse, HealthResponse, ModelStatus

logger = logging.getLogger(__name__)


def error_response(status: int, code: str, message: str) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message))
    return JSONResponse(status_code=status, content=body.model_dump(by_alias=True))


def create_app() -> FastAPI:
    app = FastAPI(title="I-ITSM intelligence service", version="0.1.0")
    app.state.settings = Settings()
    app.state.classifier = ClassifierChain()
    app.state.risk_estimator = RiskEstimatorChain()
    app.state.embedder = None
    app.state.embedding_lock = threading.Lock()

    @app.middleware("http")
    async def request_id(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        identifier = request.headers.get("X-Request-Id", str(uuid4()))
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("Unhandled intelligence service error")
            response = error_response(500, "INTERNAL_ERROR", "Internal server error")
        response.headers["X-Request-Id"] = identifier
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "VALIDATION_ERROR", "Request does not match the HTTP contract")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code = "NOT_IMPLEMENTED" if exc.status_code == 501 else f"HTTP_{exc.status_code}"
        return error_response(exc.status_code, code, str(exc.detail))

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            models=ModelStatus(
                classifier=app.state.classifier.model is not None,
                sla_risk=app.state.risk_estimator.model is not None,
                embedder=app.state.embedder is not None,
                gemini=bool(app.state.settings.gemini_api_key),
            )
        )

    app.include_router(router)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("itsm_ml.main:app", host="0.0.0.0", port=Settings().port)
