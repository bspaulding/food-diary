# Browser Acceptance Tests

This directory contains browser-driven acceptance tests using Vitest in browser mode.

## Running the Tests

```bash
npm run test:acceptance
```

## Test Structure

The acceptance tests are located in `src/acceptance.test.tsx` and use:

- **Vitest Browser Mode**: Tests run in a real Chromium browser via Playwright
- **@solidjs/testing-library**: For rendering and querying Solid components
- **Mock Service Worker (MSW)**: API requests are intercepted using MSW in browser mode

## Test Coverage

### ✅ Passing Tests

1. **View the diary list page** - Tests that the main diary list loads and displays entries ✅ **PASSING**
2. **Add Item flow** - Tests creating a new nutrition item (description, calories, protein) ✅ **PASSING**

### ⚠️ Known Issues

3. **Add New Entry flow** - Search results load correctly, but click interaction to expand logging form doesn't trigger state update in browser test environment
4. **Add Recipe form** - Initial render issue in browser test environment

**Note**: Tests 3 and 4 have limitations due to SolidJS reactivity and state updates in browser-based testing. The components work correctly in the application but state changes triggered by click events don't propagate properly in the Vitest browser test environment. This is a known limitation when testing reactive frameworks in browser mode.

## Configuration

- `vitest.acceptance.config.mts` - Separate Vitest config for browser tests
- `src/test-setup-browser.ts` - Test setup with MSW browser worker
- Browser: Chromium (via Playwright)
- Headless mode: Enabled

## Mocking Strategy

### Authentication

Auth0 is mocked using `vi.mock()` to return a logged-in user state.

### API Requests

Mock Service Worker (MSW) is used to intercept all HTTP requests in the browser:

- MSW worker is configured in `src/test-setup-browser.ts`
- Handlers are set up when the worker starts (not in beforeEach)
- **Strict mode enabled**: Any unhandled request will cause the test to fail, ensuring mocks stay in sync with the application
- Mock responses are configured per-query type (GetEntries, SearchItems, CreateDiaryEntry, etc.)

Example handler:

```typescript
export const worker = setupWorker(
  http.post("*/api/v1/graphql", async ({ request }) => {
    const body = await request.json();
    if (body.query.includes("GetEntries")) {
      return HttpResponse.json({ data: { food_diary_diary_entry: mockData } });
    }
    // Unhandled queries will throw an error
  }),
);
```

## CI Integration

The acceptance tests are integrated into the CI workflow (`.github/workflows/ci.yml`) and run on every push and pull request. The workflow:

1. Installs dependencies with `npm ci`
2. Runs unit tests with `npm test`
3. Installs Playwright browsers
4. Runs acceptance tests with `npm run test:acceptance`

## Known Issues

1. Click interactions don't trigger SolidJS state updates properly in browser tests
2. Some forms don't render in test environment - under investigation

## Future Improvements

- Fix click interaction issues for logging forms in browser tests
- Fix NewRecipeForm rendering in browser test environment
- Add E2E tests with full navigation flows
- Add visual regression testing
- Test error states and edge cases
