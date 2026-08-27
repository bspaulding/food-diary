# Food Diary Frontend

## Before opening a PR, run all checks

Every change must pass all of the following before opening a PR:

```bash
# 1. Prettier
npm run prettier:check

# 2. Unit tests with coverage (must meet thresholds)
TZ=America/Los_Angeles npx vitest --run --coverage

# 3. Install Playwright browsers (first time only)
npx playwright install chromium

# 4. E2E acceptance tests (builds the app + boots the mock servers itself)
TZ=America/Los_Angeles npm run test:e2e
```

Or run them all in sequence:

```bash
npm run prettier:check && \
TZ=America/Los_Angeles npx vitest --run --coverage && \
TZ=America/Los_Angeles npm run test:e2e
```

> The `TZ=America/Los_Angeles` env var is required for any test that involves date/time formatting.
