# I-ITSM — Intelligent IT Service Management & Incident Resolution System

CS F213 / MAC F212 Object-Oriented Programming project, Semester I 2026-27 (Group 64).

I-ITSM handles the whole life of an IT incident: an employee reports it, it is classified and
prioritised, assigned to the right technician, tracked against its SLA, escalated when nobody
picks it up, and closed with an audit trail. It also checks new reports for duplicates and offers
a chat intake that turns a plain-language complaint into a structured incident.

- **Report:** [docs/report.pdf](docs/report.pdf)
- **Assignment specification:** [docs/spec/OOP_S1_2026-2027_Project.pdf](docs/spec/OOP_S1_2026-2027_Project.pdf)

## Team

Manoj Kumar Paskaran · Aitha Sreekar · Aditya Anand Jain · Tejas Chhabra Solanki

## Object-oriented design at a glance

The domain layer (`services/api/src/domain`) is plain TypeScript with no framework, database,
HTTP or AI-SDK imports. ESLint enforces this rule. Infrastructure plugs in through the interfaces in
`services/api/src/ports`.

| Pattern | Where | What it does |
|---|---|---|
| State | `domain/incidents/state` | Each lifecycle state decides which transitions and actions are allowed |
| Strategy | `domain/priority`, `domain/assignment` | Swappable priority algorithms (weighted score, matrix) and technician assignment (skill, load, experience, round-robin, composite) |
| Chain of Responsibility | `domain/escalation` | Technician → Team Lead → System Admin → IT Manager escalation |
| Observer | `domain/events` | Domain events (SLA warning, breach, escalation) drive notifications and audit |
| Factory | `IncidentFactory`, `EscalationChainFactory` | Build valid aggregates and chains in one place |
| Repository / Adapter | `ports/` + `infrastructure/` | Persistence, e-mail, ML service and job queue behind interfaces |

Custom exceptions live in `domain/exceptions`. Every business rule and exception path has a unit test.

## Architecture

| Path | Purpose |
|---|---|
| `apps/web` | React + TypeScript progressive web app for all roles |
| `services/api` | NestJS API: domain model, business rules, persistence, jobs, WebSockets, MCP endpoint |
| `services/ml` | Python intelligence service (FastAPI): classifier, SLA-risk model, embeddings, Gemini intake |
| `packages/contracts` | Zod schemas shared by the web app and the API |
| `infra` | Docker Compose for PostgreSQL + pgvector, Valkey, Mailpit, Grafana |
| `e2e` | Playwright end-to-end tests |
| `docs` | Assignment specification and project report |

Every machine-learning or Gemini call has a rule-based fallback, so the core workflows run
without an API key.

## Demo accounts

After seeding, every account uses the password `demo1234`.

| Role | Accounts |
|---|---|
| Employee | `priya@itsm.demo`, `rahul@itsm.demo`, `neha@itsm.demo`, `arun@itsm.demo` |
| Technician | `asha@itsm.demo`, `ben@itsm.demo`, `farah@itsm.demo`, `gopal@itsm.demo`, `irene@itsm.demo` |
| Team Lead | `chen@itsm.demo`, `divya@itsm.demo` |
| System Admin | `arjun@itsm.demo`, `sara@itsm.demo` |
| IT Manager | `kavya@itsm.demo`, `vikram@itsm.demo` |

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

## Sign in with Google (optional)

In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID,
choose **Web application**. Set the authorised JavaScript origin to
`http://localhost:5173` and the authorised redirect URI to
`http://localhost:5173/api/auth/google/callback`.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`
using that client's credentials and redirect URI, export them into the API's shell
(`set -a; . ./.env; set +a`, as below) and restart the API. Both the
ID and secret are required to enable the button. While the OAuth consent screen
is in **Testing** mode, add the Google accounts you want to use as test users.

Unknown Google accounts are created as Employees with department “Unspecified”.
Existing users keep their role; seeded users can sign in through Google only if
their email matches a Google account.

## Real email for the demo (optional)

For Gmail, open Google Account → Security → 2-Step Verification → App passwords
and create an app password. Set `SMTP_URL` in `.env` to
`smtps://<your-gmail>%40gmail.com:<app-password>@smtp.gmail.com:465`: URL-encode
the username's `@` as `%40` and remove spaces from the app password. Set
`MAIL_FROM="I-ITSM <your-gmail@gmail.com>"`; Gmail requires the sender to be the
authenticated account.

Always set `EMAIL_ALLOWLIST=you@example.com` with a real SMTP server so seeded
incidents don't email anyone else. It accepts comma-separated addresses, ignores
case and surrounding spaces, and skips other recipients without affecting in-app
notifications. Unset or empty means no filtering. `NOTIFICATIONS_EMAIL_ENABLED`
must be `true` (its default outside tests).

Set `DEMO_EMAIL_OVERRIDE=priya@itsm.demo=you@example.com` to replace exactly Priya's
seed email with your address. Re-seed after setting it: Priya then receives real
“information requested” and “incident resolved” emails, and Google sign-in with
that address lands as Priya. Other seeded accounts keep their addresses; printed
seed logins show the replacement. Unset or empty leaves the seed unchanged.

The API and seed script read the shell environment. From the repo root, export
your settings and re-seed (this resets demo data), then restart the API with the
same environment:

```sh
set -a
. ./.env
set +a
pnpm --filter @itsm/api db:seed
```

## Checks

```sh
pnpm turbo run lint typecheck test build
pnpm format:check
```

pnpm enforces a 24-hour minimum release age for new dependencies.

## Data sources

- **Ticket classifier:** [KameronB/synthetic-it-callcenter-tickets](https://huggingface.co/datasets/KameronB/synthetic-it-callcenter-tickets) (Apache-2.0), plus locally generated templates. Raw data is downloaded by script and not committed; see `services/ml/data/README.md`.
- **SLA-risk model:** UCI dataset 498, *Incident Management Process Enriched Event Log*, DOI [10.24432/C57S4H](https://doi.org/10.24432/C57S4H) (CC BY 4.0).
- **Embeddings:** [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5).
