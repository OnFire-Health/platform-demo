---
name: Generated API client can drift from openapi.yaml
description: When generated RateCard/Invoice types don't match the spec, regenerate codegen before editing UI
---

# Generated API client drift

The committed generated client (`lib/api-client-react/src/generated/*` and the zod
package) can fall out of sync with `lib/api-spec/openapi.yaml` — e.g. `RateCard`
showed `name/amount/currency` while the spec defines
`productName/company/type/fullPrice/...`. Observed twice; the second time it
coincided with unrelated task merges (dependency/security fixes) landing.

**Why:** generated output is committed, so a stale snapshot from another branch can
win a merge even though the spec is correct. tsc then fails against the wrong shape.

**How to apply:** if generated types contradict `openapi.yaml`, treat the spec as
truth and run `pnpm --filter @workspace/api-spec run codegen`, then typecheck —
don't edit code to match the stale generated types.
