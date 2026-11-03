# I-ITSM — Intelligent IT Service Management & Incident Resolution System

CS F213 / MAC F212 OOP project, Semester I 2026-27.

Incident lifecycle management (report → classify → prioritise → assign → resolve → close) with SLA monitoring, auditing, reporting, and ML/Gemini-assisted classification, duplicate detection and incident intake.

Team: Manoj Kumar Paskaran, Aditya Jain.

## Prerequisites

- Node.js 24 (version is pinned in `.nvmrc`)
- pnpm via `corepack enable pnpm`
- Docker with Compose
- uv for `services/ml`

## Quick start

```sh
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm i
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health
- Mailpit: http://localhost:8025
- Grafana: http://localhost:3001

## Checks

```sh
pnpm turbo run lint typecheck test build
pnpm format:check
```

pnpm enforces a 24-hour minimum release age for new dependencies.

## Repo layout

| Path | Purpose |
|---|---|
| `apps/web` | React web application and PWA |
| `services/api` | NestJS API and core business logic |
| `services/ml` | Python intelligence service |
| `packages/contracts` | Shared Zod API contracts |
| `infra` | Local infrastructure and deployment configuration |
| `docs` | Assignment specification and project report |
