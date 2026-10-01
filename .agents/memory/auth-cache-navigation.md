---
name: Auth cache and return navigation
description: Inactive cached unauthenticated queries can redirect immediately after a successful login
---

Before navigating from login into the protected layout, seed the operator-auth query with the successful login result; cancel an older auth fetch first.

**Why:** An invalidated inactive TanStack Query retains `authenticated: false`. On protected-layout remount it can report `isLoading: false` while refetching, so the auth guard sends the user back to login before the new response arrives. Invalidation alone does not fix this race.

**How to apply:** Any login or reauthentication flow that navigates immediately into protected routes, especially hosted-checkout returns that must preserve query parameters.