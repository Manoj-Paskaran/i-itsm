# I-ITSM intelligence service (T01)

Foundation for SCOPE **ML-1** and **AI-1**, Python 3.12, FastAPI and uv.
No API key, database, trained model, or downloaded embedding model is required.
All exact dependency versions are recorded in `uv.lock`.

## Development

From `services/ml/`:

```sh
uv sync --locked
uv run ruff check .
uv run mypy src tests
uv run pytest
uv run uvicorn itsm_ml.main:app --host 0.0.0.0 --port 8001
```

`GET /docs` serves Swagger UI; `GET /health` reports status and loaded-model flags.
All four model flags are false in this scaffold, including when a Gemini key is configured.
`uv run itsm-ml` also starts the service and honors `PORT` (default 8001).
Configuration comes from process environment or a local `.env` (never commit it):
`GEMINI_API_KEY` (optional), `GEMINI_MODEL` (empty by default),
`EMBEDDING_MODEL` (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions for future work),
`ARTIFACTS_DIR` (`artifacts`), `PORT` (`8001`). Embedding model changes will require re-embedding.
In restricted cloud environments, use a writable `UV_CACHE_DIR`, for example `/workspace/.cache/uv`.

## HTTP contract v1

JSON uses camelCase, matching the API contract. Impact/urgency are integers 1–4;
priority uses `P1`–`P4`. Responses echo `X-Request-Id` (or generate one if absent).
Errors use `{ "error": { "code": "...", "message": "..." } }`, including validation,
404/405 and unexpected server errors. OpenAPI documents every request/response model.

- `POST /v1/classify`: keyword classification for hardware, software, network,
  database, cloud, security, authentication, application, storage. Optional
  `allowedCategories` constrains all candidates, including custom categories.
  Empty lists are rejected. Case-insensitive whole-word hits are normalized into
  scores; no hits produce a uniform distribution with stable input-order tie breaking.
  These are heuristic scores, not calibrated probabilities. `ClassifierChain`
  tries an injected model then rule fallback; the model slot is empty in T01.
- `POST /v1/sla-risk`: `RiskEstimatorChain` uses the same model-to-rules pattern.
  The scaffold compares `minutesToDeadline` with heuristic priority targets of
  60/240/480/1440 minutes for P1/P2/P3/P4. Remaining fraction <= 25% is high risk,
  <= 50% is medium, otherwise low; probability is `clamp(1 - fraction, 0, 1)`.
  Negative deadlines are overdue (probability 1). These defaults are not authoritative
  per-service SLA policies or a trained predictor; T42 replaces/extends them.
- `POST /v1/embed`, `/v1/intake`, `/v1/post-incident-report`: validate full request
  shape and return 501 `NOT_IMPLEMENTED`, as required by T01. Invalid inputs return
  422 `VALIDATION_ERROR` before the stub executes. Incident fields remain an open
  object because contract v1 deliberately leaves their structure unspecified.

```sh
curl -fsS http://localhost:8001/health
curl -fsS http://localhost:8001/v1/classify -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo' -d '{"text":"My wifi is down","allowedCategories":["network","hardware"]}'
```

## Container

From the repository root:

```sh
docker build -t itsm-ml services/ml
docker run --rm -p 8001:8001 itsm-ml
```

The multi-stage image installs locked runtime dependencies with uv, runs as UID
10001, and honors `PORT`. In the managed cloud environment, supply its combined CA
bundle to the optional build secret, keeping TLS verification enabled:

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t itsm-ml services/ml
```

`data/classification-samples.json` contains nine synthetic examples used by tests.
Put untracked raw datasets in `data/raw/`; trained artifacts belong in `artifacts/`,
with experiments ignored by the root `.gitignore`. No training runs or AI calls
occur during startup. Next tasks: T40 classifier, T41 embeddings, T42 risk model,
T43 Gemini intake. The API integrates through `IntelligencePort` in T44.
