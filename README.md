# Platform Demo — Onfire Multi-Tenant Reference Integration

A reference implementation of an Onfire **Platform** integration — third-party
software that hosts many independent practitioners and connects each one to
Onfire on their behalf through a single Connected App, then routes their
invoices and webhooks by `partner_public_id`.

Full integration guide: **https://www.onfirehealth.com/developers/platform-connection**

## What this demonstrates

- Connecting multiple practitioners through **one** OAuth Connected App
  (`client_id`/`client_secret` shared across all of them).
- Listing each practitioner's own rate cards and creating invoices on their
  behalf (no cross-tenant bleed).
- Receiving **all** practitioners' `invoice.*` webhooks at a single endpoint
  and routing each event to the right connection by `partner_public_id`.
- Verifying the HMAC-SHA256 webhook signature over the raw request body.

## Build spec

The original requirements this reference integration was built against:
[`attached_assets/Pasted-...-build-spec.txt`](./attached_assets/Pasted--platform-demo-build-spec-Replit-A-reference-integratio_1781730689458.txt).

## Run

```
pnpm install
pnpm --filter @workspace/db run push        # push the DB schema (dev only)
pnpm --filter @workspace/api-server run dev # API server, proxied at /api
pnpm --filter @workspace/platform-demo run dev # operator console, served at /
```

## Configuration

Set these environment variables (see the integration guide linked above for
where each Onfire value comes from):

```
DATABASE_URL=                  # Postgres connection string
SESSION_SECRET=                # express-session signing secret
PLATFORM_OPERATOR_PASSWORD=    # this demo's own operator login (not an Onfire credential)

ONFIRE_PROJECT_DOMAIN=
ONFIRE_PROJECT_ID=
ONFIRE_OAUTH_CLIENT_ID=
ONFIRE_OAUTH_CLIENT_SECRET=
ONFIRE_AUTHORIZE_URL=
ONFIRE_API_BASE=                # ends in /api/v1
ONFIRE_WEBHOOK_SIGNING_SECRET=  # from registering a webhook endpoint — see the guide, §7.1
ONFIRE_REDIRECT_URI=            # defaults to <app>/api/oauth/callback
ONFIRE_OAUTH_SCOPES=            # defaults to "payment-connection offline_access"
```

More detail on architecture and where things live is in [`replit.md`](./replit.md).
