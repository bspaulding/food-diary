# End-to-end acceptance tests

A single, long, stateful Playwright journey (`tests/full-app-journey.spec.ts`)
that drives the real production build of the app in a real browser against
two real (but in-memory, empty-on-boot) mock servers standing in for Auth0
and the Hasura GraphQL API. No `vi.mock()`, no MSW, no test-only endpoints —
everything is seeded through the actual UI as the test goes.

Design rationale, the mock servers' contracts, and the test's full step
outline live in
[`specs/2026-08-26-web-e2e-acceptance-test-harness.md`](../../specs/2026-08-26-web-e2e-acceptance-test-harness.md).

## Running

```bash
npm run test:e2e
```

This builds the app and boots all three processes (mock auth server, mock
API server, `vite preview`) via Playwright's own `webServer` orchestration —
no manual setup required. First time only: `npx playwright install chromium`.

## Layout

- `playwright.config.ts` — the three `webServer` entries plus browser/project
  config (including the fake camera device flags `CameraModal`'s scan flow
  needs).
- `servers/mock-auth-server/`, `servers/mock-api-server/` — the two mock
  servers, each with their own Vitest unit tests (`npm run test:e2e:servers`).
- `support/login.ts` — drives the mock server's real HTML login form.
- `fixtures/` — binary/static fixtures only (`nutrition-label.jpg` for the
  camera-scan flow); CSV fixtures are generated inline in the test itself
  since their dates need to stay relative to the real clock.
