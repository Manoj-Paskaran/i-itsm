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

## Repo layout

| Path | Purpose |
|---|---|
| `apps/web` | React web application and PWA |
| `services/api` | NestJS API and core business logic |
| `services/ml` | Python intelligence service |
| `packages/contracts` | Shared Zod API contracts |
| `infra` | Local infrastructure and deployment configuration |
| `docs` | Assignment specification and project report |
