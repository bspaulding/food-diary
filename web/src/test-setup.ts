import { beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Setup MSW server with default handlers for common requests
export const server = setupServer(
  // Default handler for GraphQL requests
  http.post("/api/v1/graphql", () => {
    return HttpResponse.json({
      data: {},
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
