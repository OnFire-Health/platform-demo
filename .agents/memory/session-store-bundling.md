---
name: connect-pg-simple in a bundled server
description: Why the express-session Postgres store table must be managed by Drizzle, not createTableIfMissing
---

# connect-pg-simple + esbuild bundling

When the API server is bundled with esbuild, `connect-pg-simple`'s
`createTableIfMissing: true` does NOT create the session table. The package
reads its `table.sql` from a path relative to its own source file at runtime;
once bundled into `dist/`, that path doesn't exist, the read throws, and the
error is swallowed. Symptom: login succeeds and sets a `connect.sid` cookie, but
every subsequent request reads an empty session (`authenticated: false`) because
the row was never persisted — and the table simply doesn't exist in Postgres.

**Rule:** Define the session table in the Drizzle schema (columns `sid varchar
PK`, `sess json`, `expire timestamp(6)` + index on `expire` — the shape
connect-pg-simple expects) and push it. Set `createTableIfMissing: false`.

**Why:** Bundlers break runtime file reads that rely on `__dirname`-relative
asset paths inside dependencies. Managing the table ourselves makes it work in
both dev and production and keeps it under migration control.

**How to apply:** Any time a dependency stores schema/SQL/asset files alongside
its JS and reads them at runtime, do not assume they survive bundling — provide
the resource explicitly (here, a Drizzle-managed table).
