import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import supertest from "supertest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sign } from "jsonwebtoken";
import { app, extractBearerToken } from "./index.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

function makeToken() {
  return sign({ sub: "user-123" }, SECRET, { audience: AUDIENCE, expiresIn: "1h" });
}

const mswServer = setupServer(
  http.post(AUDIENCE, () => HttpResponse.json({ data: {} }))
);

beforeAll(() => {
  process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
  process.env.AUTH0_AUDIENCE = AUDIENCE;
  mswServer.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => mswServer.resetHandlers());

afterAll(() => {
  delete process.env.HASURA_GRAPHQL_JWT_SECRET;
  delete process.env.AUTH0_AUDIENCE;
  mswServer.close();
});

describe("extractBearerToken", () => {
  it("returns null when no Authorization header is present", () => {
    expect(extractBearerToken({ headers: {} } as Parameters<typeof extractBearerToken>[0])).toBeNull();
  });

  it("returns null when Authorization is not a Bearer token", () => {
    expect(
      extractBearerToken({ headers: { authorization: "Basic dXNlcjpwYXNz" } } as Parameters<typeof extractBearerToken>[0])
    ).toBeNull();
  });

  it("returns the token when Authorization is a valid Bearer header", () => {
    expect(
      extractBearerToken({ headers: { authorization: "Bearer my-token" } } as Parameters<typeof extractBearerToken>[0])
    ).toBe("my-token");
  });
});

describe("GET /.well-known/oauth-protected-resource", () => {
  it("returns OAuth resource metadata with Auth0 as the authorization server", async () => {
    const res = await supertest(app).get("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);
    expect(res.body.authorization_servers).toContain("https://motingo.auth0.com/");
    expect(res.body.bearer_methods_supported).toContain("header");
    expect(res.body.resource).toMatch(/\/mcp$/);
  });
});

describe("GET /.well-known/oauth-authorization-server", () => {
  it("returns OAuth authorization server metadata pointing to Auth0 token endpoint", async () => {
    const res = await supertest(app).get("/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    expect(res.body.authorization_endpoint).toMatch(/\/authorize$/);
    expect(res.body.token_endpoint).toBe("https://motingo.auth0.com/oauth/token");
    expect(res.body.code_challenge_methods_supported).toContain("S256");
    expect(res.body.grant_types_supported).toContain("authorization_code");
  });
});

describe("GET /mcp/authorize", () => {
  it("redirects to Auth0 authorize endpoint forwarding all query params", async () => {
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=test123&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256&state=xyz"
    );
    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("motingo.auth0.com/authorize");
    expect(location).toContain("client_id=test123");
    expect(location).toContain("code_challenge=abc");
    expect(location).toContain("state=xyz");
  });
});

describe("POST /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await supertest(app).post("/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/);
  });

  it("returns 401 when Authorization is not a Bearer token", async () => {
    const res = await supertest(app).post("/mcp").set("Authorization", "Basic dXNlcjpwYXNz").send({});
    expect(res.status).toBe(401);
  });

  it("returns 401 when the JWT is invalid", async () => {
    const res = await supertest(app)
      .post("/mcp")
      .set("Authorization", "Bearer not-a-valid-jwt")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it("passes a valid token through to the MCP transport and returns a response", async () => {
    const res = await supertest(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${makeToken()}`)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });
    expect(res.status).toBe(200);
    // Transport responds with SSE; extract the data payload from the event stream
    const dataLine = res.text.split("\n").find((l) => l.startsWith("data:")) ?? "";
    const payload = JSON.parse(dataLine.slice("data:".length).trim()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(payload.result?.serverInfo?.name).toBe("food-diary");
  });
});

describe("GET /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await supertest(app).get("/mcp");
    expect(res.status).toBe(401);
  });
});

describe("DELETE /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await supertest(app).delete("/mcp");
    expect(res.status).toBe(401);
  });
});
