---
name: Native test bundle boundaries
description: Node test discovery and pnpm dependency ownership affect isolated bundled API tests
---

Put native test-runner output outside `node_modules`, and bundle transitive workspace-library dependencies unless the test-owning package declares those external dependencies itself.

**Why:** Node's test discovery excludes `node_modules` paths. Under pnpm, a dependency owned by a shared library is not necessarily resolvable as an external import from an API-package test bundle.

**How to apply:** When adding bundled server regression tests, use an ignored build-output directory and keep external imports limited to dependencies actually owned by that package.