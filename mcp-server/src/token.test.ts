import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verify } from "jsonwebtoken";
import { issueAccessToken } from "./token.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

describe("issueAccessToken", () => {
  beforeEach(() => {
    process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
    process.env.AUTH0_AUDIENCE = AUDIENCE;
  });

  afterEach(() => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    delete process.env.AUTH0_AUDIENCE;
    delete process.env.MCP_SERVER_URL;
  });

  it("returns a JWT verifiable with the Hasura secret", () => {
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    expect(decoded.sub).toBe("auth0|user-123");
  });

  it("includes the Hasura JWT claims namespace with the correct user id", () => {
    const token = issueAccessToken("auth0|user-456");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    const claims = decoded["https://hasura.io/jwt/claims"] as Record<string, unknown>;
    expect(claims["x-hasura-user-id"]).toBe("auth0|user-456");
    expect(claims["x-hasura-default-role"]).toBe("user");
    expect(claims["x-hasura-allowed-roles"]).toEqual(["user"]);
  });

  it("uses MCP_SERVER_URL as the issuer", () => {
    process.env.MCP_SERVER_URL = "https://food-diary.motingo.com/mcp";
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, {
      audience: AUDIENCE,
      issuer: "https://food-diary.motingo.com/mcp",
    }) as Record<string, unknown>;
    expect(decoded.iss).toBe("https://food-diary.motingo.com/mcp");
  });

  it("falls back to the default audience when AUTH0_AUDIENCE is not set", () => {
    delete process.env.AUTH0_AUDIENCE;
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, {
      audience: "https://direct-satyr-14.hasura.app/v1/graphql",
    }) as Record<string, unknown>;
    expect(decoded.sub).toBe("auth0|user-123");
  });

  it("throws when HASURA_GRAPHQL_JWT_SECRET is not set", () => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    expect(() => issueAccessToken("sub")).toThrow("HASURA_GRAPHQL_JWT_SECRET is not set");
  });
});
