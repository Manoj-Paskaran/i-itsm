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
Health reports loaded model state and whether a Gemini key is configured.
`uv run itsm-ml` also starts the service and honors `PORT` (default 8001).
Configuration comes from process environment or a local `.env` (never commit it):
`GEMINI_API_KEY` (optional), `GEMINI_MODEL` (empty by default),
`EMBEDDING_MODEL` (`BAAI/bge-small-en-v1.5`, 384 dimensions for future work),
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
  Risk is the fraction of the actual SLA window already elapsed:
  `minutesOpen / (minutesOpen + minutesToDeadline)`. At 75% the risk is high;
  at 50% it is medium; below that it is low. Already breached or zero windows
  yield probability 1 and high risk. These are rules, not calibrated predictions.
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

## Embeddings (T41)

`POST /v1/embed` accepts 1–64 texts and returns L2-normalised 384-dimensional
vectors from `BAAI/bge-small-en-v1.5`. The local model is initialised once, lazily.
Set `FASTEMBED_CACHE_PATH` for its cache and `EMBEDDING_LOCAL_ONLY=true` to disallow
downloads. Docker preloads the model and runs in local-only mode.
`EMBEDDING_PROVIDER=gemini` opts into `GEMINI_EMBEDDING_MODEL`; it requires a key
and requests `EMBEDDING_DIM` (384 by default). Incompatible output fails with 503;
providers never silently mix dimensions. Run `uv run pytest --run-slow tests/test_embeddings.py`
for the downloaded-model paraphrase test. Default tests use fakes and no network.
