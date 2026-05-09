# Copilot Instructions for Food Diary Frontend

## Project Overview

This is a SolidJS frontend application for a food diary/nutrition tracking web app. The application uses TypeScript, Vite for bundling, and TailwindCSS for styling.

## Technology Stack

- **Framework**: SolidJS (not React - SolidJS has different patterns and primitives)
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS with the @tailwindcss/forms plugin
- **Testing**: Vitest
- **Routing**: @solidjs/router
- **Authentication**: Auth0 (@auth0/auth0-spa-js)

## Project Structure

```
src/
├── App.tsx              # Main application component with auth wrapper
├── index.tsx            # Entry point with route definitions
├── Api.ts               # GraphQL API client and type definitions
├── Auth0.ts             # Auth0 authentication context
├── *.tsx                # Page and UI components
├── *.test.ts            # Test files
├── index.css            # Global styles
└── assets/              # Static assets
```

## Coding Conventions

### SolidJS Patterns

- Use SolidJS reactive primitives: `createSignal`, `createResource`, `createEffect`, `createMemo`
- Use `Show` component for conditional rendering instead of ternary operators
- Components are typed using `Component` from solid-js
- JSX uses `class` attribute (not `className` as in React)

### TypeScript

- Use strict TypeScript configuration
- Define types for API responses and data structures
- Use type imports: `import type { Component } from "solid-js"`
- Prefer explicit typing over inference for function parameters and return types

### Styling

- Use TailwindCSS utility classes directly in JSX
- Avoid custom CSS when possible; use Tailwind's utility-first approach
- Use the `@tailwindcss/forms` plugin for form styling

### API Layer

- This application uses a hasura/graphql-engine backend
- GraphQL queries and mutations are defined as template strings in `Api.ts`
- API functions accept an `accessToken` as the first parameter
- Use snake_case for GraphQL field names, camelCase for TypeScript properties
- Use the `objectToSnakeCaseKeys` helper when sending data to the API

### Testing

- Use Vitest for testing
- Test files are named `*.test.ts` and placed alongside source files
- Use `describe`, `it`, and `expect` from Vitest
- Tests run with `npm test`
- Tests expect to be run in the America/Los_Angeles timezone. set TZ=America/Los_Angeles before running
- **NEVER mock `fetch` directly** - always use Mock Service Worker (MSW) instead
- MSW is configured in `src/test-setup.ts` with a `server` export
- Import `server` from `./test-setup` and use `server.use()` to mock HTTP requests
- Use `http.post()` or `http.get()` from `msw` to define request handlers
- Example:

  ```typescript
  import { http, HttpResponse } from "msw";
  import { server } from "./test-setup";

  server.use(
    http.post("/api/v1/graphql", () => {
      return HttpResponse.json({
        data: {
          /* mock data */
        },
      });
    }),
  );
  ```

### Automated Checks

This project uses several automated checks that must pass before any pull request is merged.

- tsc checks for any errors or warnings in typescript types
- type-coverage checks that 100% of code has explicit types (no implicit any)
- test coverage checks that code coverage meets minimum thresholds (lines: 93%, functions: 95%, branches: 74%, statements: 93%)
- prettier checks for consistent formatting
- the unit tests must pass
- the acceptance tests must pass

please run all of these checks, and make sure they pass, before committing changes.

To run test coverage locally: `npm test -- --coverage`

**IMPORTANT**: Never adjust coverage thresholds downward. If coverage drops below the threshold, add tests to bring coverage back up, not lower the threshold. Coverage thresholds should only be maintained or increased, never decreased.

## Common Commands

- `npm install` - Install dependencies
- `npm run dev` or `npm start` - Start development server on port 3000 (both commands are equivalent)
- `npm run build` - Build for production
- `npm test` - Run tests with Vitest

## Development Notes

- The app uses Auth0 for authentication; users must be logged in to access features
- API calls go through `/api` proxy which forwards to the backend GraphQL endpoint
- Date handling uses `date-fns` library
- CSV import/export functionality is available for diary entries
