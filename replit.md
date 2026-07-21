# Platform Demo — Onfire Multi-Tenant Reference Integration

A reference "Platform" that hosts many independent practitioners. Each practitioner connects their own Onfire Health partner account via OAuth (authorization_code) through a single Connected App. The platform lists each practitioner's own rate cards, creates invoices on their behalf, and receives all invoice webhooks at ONE platform receiver that routes each event to the right practitioner by `partner_public_id`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (proxied at `/api`)
- `pnpm --filter @workspace/platform-demo run dev` — run the React/Vite operator console (served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Operator login password: `PLATFORM_OPERATOR_PASSWORD` (default `demo`)

### Required env / secrets

- `DATABASE_URL` — Postgres connection string (runtime-managed)
- `SESSION_SECRET` — express-session signing secret (already present)
- Onfire Connected App (shared across all practitioners): `ONFIRE_PROJECT_DOMAIN`, `ONFIRE_PROJECT_ID`, `ONFIRE_OAUTH_CLIENT_ID`, `ONFIRE_OAUTH_CLIENT_SECRET`, `ONFIRE_AUTHORIZE_URL`, `ONFIRE_API_BASE` (ends in `/api/v1`), `ONFIRE_WEBHOOK_SIGNING_SECRET`
- Optional: `ONFIRE_REDIRECT_URI` (defaults to `<app>/api/oauth/callback`), `ONFIRE_OAUTH_SCOPES`, `ONFIRE_PARTNER_INFO_PATH`, `PLATFORM_OPERATOR_PASSWORD`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, express-session + connect-pg-simple (session store)
- Frontend: React + Vite (operator console)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS/ESM bundle)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml` → generates `@workspace/api-zod` (Zod) and `@workspace/api-client-react` (hooks)
- DB schema (source of truth): `lib/db/src/schema/` — `connections`, `oauthStates`, `invoices`, `webhookEvents`, `sessions` (connect-pg-simple store)
- Backend Onfire logic: `artifacts/api-server/src/lib/{config,jwt,onfire,session}.ts`
- Routes: `artifacts/api-server/src/routes/{session,platform,connections,oauth,webhooks}.ts`
- Frontend: `artifacts/platform-demo/src/`

## Architecture decisions

- **Single Connected App, many tenants.** One `client_id`/`client_secret` is shared across every connected practitioner — that is the platform model. Connections are keyed and UPSERTed by `partner_public_id` (never delete-then-insert) so re-connecting refreshes the same row.
- **One webhook receiver, routed per tenant.** All Onfire invoice webhooks hit `/api/webhooks/onfire`. The handler verifies a Stripe-style HMAC (`t=…,v1=…`, SHA-256 over `${t}.${rawBody}`), dedupes on the envelope `id`, then routes to a connection by `data.invoice.partner_public_id` and correlates the local invoice mirror on `external_invoice_ref`.
- **Idempotent invoice creation.** We generate `external_invoice_ref` before calling Onfire and store it; the unique index on `(connection_id, external_invoice_ref)` prevents duplicates on re-POST.
- **Raw body for webhooks only.** `express.raw` is mounted on `/api/webhooks/onfire` BEFORE `express.json` so the HMAC is computed over exact bytes; body-parser's `req._body` flag makes the json parser skip it.
- **Tokens never leave the server.** Connection serialization omits access/refresh tokens.

## Product

Operator-facing console: log in, connect practitioners via Onfire OAuth, view each practitioner's own rate cards (no cross-tenant bleed), create invoices, and watch the live webhook event log with per-practitioner routing.

## User preferences

_None recorded yet._

## Gotchas

- The connect-pg-simple session table is managed via Drizzle (`lib/db/src/schema/sessions.ts`), NOT `createTableIfMissing`. The bundled server cannot read the package's `table.sql` at runtime, so `createTableIfMissing` silently no-ops. Run `pnpm --filter @workspace/db run push` after a fresh DB.
- `ONFIRE_API_BASE` must end in `/api/v1`; Onfire calls use relative paths (`/meta/partner-rate-cards/`, `/core/partner/invoices/`).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
