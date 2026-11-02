# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
# Optional session CA is supplied by managed environments, never baked into the image.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    uv sync --locked --no-dev --no-editable --python /usr/local/bin/python3.12

FROM python:3.12-slim-bookworm AS runtime
RUN groupadd --gid 10001 itsm && useradd --uid 10001 --gid itsm --create-home itsm
WORKDIR /app
COPY --from=builder --chown=itsm:itsm /app/.venv /app/.venv
RUN mkdir /app/artifacts && chown itsm:itsm /app/artifacts
ENV PATH="/app/.venv/bin:$PATH" PORT=8001 ARTIFACTS_DIR=/app/artifacts
USER itsm
EXPOSE 8001
CMD ["itsm-ml"]
