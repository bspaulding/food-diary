import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { gql } from "./graphql.js";

const HASURA_URL = "https://direct-satyr-14.hasura.app/v1/graphql";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("gql", () => {
  it("returns data on success", async () => {
    server.use(
      http.post(HASURA_URL, () => HttpResponse.json({ data: { items: [{ id: 1 }] } }))
    );
    const result = await gql<{ items: { id: number }[] }>("jwt", "query { items { id } }");
    expect(result).toEqual({ items: [{ id: 1 }] });
  });

  it("sends the Bearer token in the Authorization header", async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post(HASURA_URL, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ data: {} });
      })
    );
    await gql("my-jwt", "query { __typename }");
    expect(capturedAuth).toBe("Bearer my-jwt");
  });

  it("sends variables when provided", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ data: {} });
      })
    );
    await gql("jwt", "query Q($id: Int!) { item(id: $id) { id } }", { id: 42 });
    expect(capturedBody).toMatchObject({ variables: { id: 42 } });
  });

  it("throws on GraphQL errors", async () => {
    server.use(
      http.post(HASURA_URL, () =>
        HttpResponse.json({ errors: [{ message: "field not found" }, { message: "another error" }] })
      )
    );
    await expect(gql("jwt", "query { bad }")).rejects.toThrow("field not found, another error");
  });

  it("throws on HTTP error response", async () => {
    server.use(
      http.post(HASURA_URL, () => new HttpResponse(null, { status: 500, statusText: "Internal Server Error" }))
    );
    await expect(gql("jwt", "query { __typename }")).rejects.toThrow(
      "Hasura request failed: 500 Internal Server Error"
    );
  });

  it("uses HASURA_GRAPHQL_URL env var when set", async () => {
    const customUrl = "https://custom-hasura.example.com/v1/graphql";
    process.env.HASURA_GRAPHQL_URL = customUrl;
    server.use(http.post(customUrl, () => HttpResponse.json({ data: { ok: true } })));
    try {
      const result = await gql<{ ok: boolean }>("jwt", "query { ok }");
      expect(result).toEqual({ ok: true });
    } finally {
      delete process.env.HASURA_GRAPHQL_URL;
    }
  });
});
