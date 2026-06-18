# Threat Model

## Project Overview

This project is a multi-tenant platform demo that lets a platform operator connect multiple independent OnFire practitioner accounts, view each practitioner's rate cards, create invoices on their behalf, and receive all OnFire invoice webhooks at a single routed receiver. The production application is a React/Vite frontend backed by an Express API with PostgreSQL persistence. Production-relevant backend entry points live under `artifacts/api-server/src/`; `artifacts/mockup-sandbox/` is dev-only and should be ignored unless production reachability is proven.

## Assets

- **Operator session state** — the authenticated operator session gates access to every practitioner connection, invoice mirror, and webhook log entry.
- **OnFire OAuth credentials and refresh tokens** — bearer tokens stored for each practitioner connection allow the platform to read rate cards, create invoices, and revoke access.
- **Practitioner and invoice data** — practitioner identifiers, invoice references, client contact details, billing addresses, amounts, and statuses are sensitive business and patient-adjacent data.
- **Webhook trust material** — the webhook signing secret protects the integrity of inbound OnFire events.
- **Application secrets** — session secret, database credentials, and OnFire client credentials control access to the platform and upstream OnFire tenant operations.

## Trust Boundaries

- **Browser to API** — all operator actions originate in an untrusted browser and cross into the Express API.
- **Unauthenticated to authenticated API routes** — `/api/session`, `/api/oauth/callback`, `/api/healthz`, and `/api/webhooks/onfire` are reachable without an operator session; all other business routes should enforce authentication.
- **API to PostgreSQL** — the API persists operator sessions, connection tokens, invoice mirrors, OAuth state, and webhook events in Postgres.
- **API to OnFire** — the API exchanges OAuth codes, refreshes tokens, revokes tokens, fetches rate cards, and creates invoices against OnFire using stored credentials.
- **Public webhook sender to API** — webhook requests must be accepted only when their HMAC signature and freshness checks succeed.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox/` is assumed non-production; scanning should focus on `artifacts/api-server/`, `artifacts/platform-demo/`, `lib/db/`, and generated API client/schema packages that affect those surfaces.

## Scan Anchors

- Production API entry point: `artifacts/api-server/src/app.ts` and route files in `artifacts/api-server/src/routes/`.
- Highest-risk code areas: `routes/session.ts`, `lib/session.ts`, `routes/webhooks.ts`, `routes/connections.ts`, `routes/oauth.ts`, and `lib/onfire.ts`.
- Public routes: `/api/healthz`, `/api/session`, `/api/oauth/callback`, `/api/webhooks/onfire`.
- Authenticated routes: `/api/platform/*`, `/api/connections*`, `/api/webhook-events`.
- Usually ignore: `artifacts/mockup-sandbox/` unless there is evidence it ships to production.

## Threat Categories

### Spoofing

The platform uses a single operator login backed by an Express session. The system must require a strong, non-default operator secret in production, protect the session cookie appropriately for a TLS-terminated deployment, and resist online guessing against `/api/session`. OnFire webhooks must be accepted only after HMAC verification with a configured signing secret.

### Tampering

Operators can create invoices on behalf of practitioners and disconnect practitioner OAuth connections. The server must validate all request bodies server-side, enforce idempotency for invoice creation, and ensure webhook updates modify only the intended tenant's invoice mirror.

### Information Disclosure

The application stores practitioner OAuth tokens and displays invoice and webhook data for all connected practitioners to any authenticated operator. Secrets must never reach the client, and logs and API responses must avoid leaking tokens, cookies, or unnecessary client billing/contact data. Multi-tenant data returned by authenticated routes must remain scoped to intended platform users.

### Denial of Service

Unauthenticated routes such as `/api/session` and `/api/webhooks/onfire` are exposed to the network. The application must resist brute-force login attempts, replay floods, and malformed or repeated webhook traffic without exhausting operator access or upstream OnFire quotas.

### Elevation of Privilege

A compromise of the operator auth boundary grants control over every connected practitioner account. All sensitive API routes must enforce authentication server-side, and no user-controlled input may be able to bypass tenant routing, forge webhook origin, or trigger privileged OnFire operations outside the selected connection.
