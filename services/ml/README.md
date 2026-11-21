# I-ITSM intelligence service

Foundation for SCOPE **ML-1** and **AI-1**, Python 3.12, FastAPI and uv.
Core rule fallbacks require no API key, database or trained artifacts. Embeddings use a cached local model.
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
`EMBEDDING_MODEL` (`BAAI/bge-small-en-v1.5`, 384 dimensions),
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
  tries the saved model, then configured Gemini for uncertain predictions, then rules.
- `POST /v1/sla-risk`: `RiskEstimatorChain` uses the same model-to-rules pattern.
  A saved calibrated model runs first. The fallback risk is the fraction of the actual SLA window already elapsed:
  `minutesOpen / (minutesOpen + minutesToDeadline)`. At 75% the risk is high;
  at 50% it is medium; below that it is low. Already breached or zero windows
  yield probability 1 and high risk. These are rules, not calibrated predictions.
- `POST /v1/embed`: returns normalised vectors; see T41 below.
- `POST /v1/intake`: produces a draft and follow-up questions from the complete
  conversation, with `engine: "gemini"|"rules"`. No incident is submitted.
- `POST /v1/post-incident-report`: produces Markdown from supplied facts, with
  `engine: "gemini"|"rules"`. Incident fields remain an open object per contract v1.
  Invalid requests return 422 `VALIDATION_ERROR`.

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
occur during startup. The API integrates through `IntelligencePort` in T44.

## Embeddings (T41)

`POST /v1/embed` accepts 1–64 texts and returns L2-normalised 384-dimensional
vectors from `BAAI/bge-small-en-v1.5`. The local model is initialised once, lazily.
Set `FASTEMBED_CACHE_PATH` for its cache and `EMBEDDING_LOCAL_ONLY=true` to disallow
downloads. Docker preloads the model and runs in local-only mode.
`EMBEDDING_PROVIDER=gemini` opts into `GEMINI_EMBEDDING_MODEL`; it requires a key
and requests `EMBEDDING_DIM` (384 by default). Incompatible output fails with 503;
providers never silently mix dimensions. Run `uv run pytest --run-slow tests/test_embeddings.py`
for the downloaded-model paraphrase test. Default tests use fakes and no network.

## Classification training (T40)

Install tools using `uv sync --locked --group train`. Run
`uv run python scripts/fetch_data.py tickets`, `uv run python scripts/generate_synthetic.py`,
then `uv run --group train python scripts/train_classifier.py`. MLflow uses the ignored
local SQLite store `mlruns/tracking.db`. See `data/README.md` for provenance/mappings
and the ML evaluation section of the project report (`docs/report.pdf`) for measured results.
The service loads the saved artifact without training. Low confidence (default
`CLASSIFIER_CONFIDENCE_THRESHOLD=0.55`) falls through to Gemini when configured,
then keyword rules. Custom allowed categories still work through fallbacks.
Optional `uv run python scripts/generate_gemini.py` caches a top-up in at most
nine calls; missing credentials/model report BLOCKED. No key was available.

## SLA risk training (T42)

Run `uv run python scripts/fetch_data.py uci`, then
`uv run --group train python scripts/train_risk.py`. Snapshot features exclude
closure fields. Eventual incident outcome is the label, because source made_sla
flags usually change at closure. Train/validation/test and calibration folds
separate incident numbers. Calibration is retained only when validation Brier
improves; best model is selected by validation PR-AUC. See the ML-2 evaluation
report for measured results and the explicit policy/domain-transfer limitations.
At serving, the saved model runs before rules; already-breached requests always
return 1.0/high from the deterministic override.

## Intake and reports (T43)

Set `GEMINI_API_KEY` securely and `GEMINI_MODEL` to an available model ID to enable
Google ADK intake and Gemini reports. `GEMINI_FALLBACK_MODEL` optionally configures a second model. Without a key or model, rules are selected.
The gateway retries 429 and 503 errors, honors server RetryInfo retryDelay within the overall timeout, and does not cache rules fallback answers when models are configured. Free tier quotas are approximately 5 requests/minute and 20/day per model; intake uses approximately 3 model requests per turn.
`GEMINI_TIMEOUT_SECONDS=20` bounds the whole live request, including retries;
`GEMINI_RETRIES=2`, `GEMINI_BACKOFF_SECONDS=0.25`, and `AI_CACHE_SIZE=128` configure
retry back-off and the in-memory LRU response cache. Timeout/quota/provider errors
fall back to deterministic rules. Cached responses include their actual engine.
Restart the service after configuration changes to clear cache and reload providers.

The ADK agent has request-scoped sessions and two tools: classify_text (the local
classifier chain) and draft_incident. Allowed services and categories are in its instruction.
The entire conversation arrives with every request. Responses validate service IDs,
categories and missing fields. The fallback matches service names, uses the local
classifier, extracts explicit user counts, and asks for each missing field.
“Everyone” signals broad impact but cannot identify an exact headcount: it asks
for that number rather than inventing it. The fallback report has Summary,
Timeline, Impact, Root cause, Resolution, SLA outcome and Follow-ups; absent facts
are labelled unknown/not supplied.

Unit tests mock ADK/Gemini and never call external services. For an optional live
check with fictional inputs, run `uv run python scripts/smoke_gemini.py`. This run
reports BLOCKED because GEMINI_API_KEY and GEMINI_MODEL are absent; mocked and
fallback checks pass. API contract v1 now includes the additive engine fields.

### Hybrid chat intake

`POST /v1/chat-intake` reads the employee's first message with one structured
Gemini call per attempt. The response includes a title, summary, reply, and
optional field guesses with confidence. The guided chat handles follow-up questions.
The reader tries the configured primary and fallback models within the Gemini
timeout. The API waits up to `CHAT_INTAKE_TIMEOUT_MS` (default 15000).

The cache replays the two demo readings even without a Gemini key. It resolves
service names against the catalog supplied with each request. New successful
Gemini readings stay in memory. `CHAT_INTAKE_REPLAY_MS` sets the base replay
delay in milliseconds (1200 by default, 0 disables the delay and jitter).
An uncached message returns empty fields and engine `rules` when Gemini is unavailable.

The committed fixture contains hand-written placeholders. With `GEMINI_API_KEY`
and `GEMINI_MODEL` set in your shell environment, run from `services/ml``:

```sh
uv run python scripts/capture_chat_intake_fixture.py
```

The script captures one live response for each demo message, records the model
and capture date, and replaces the fixture after both calls succeed.

