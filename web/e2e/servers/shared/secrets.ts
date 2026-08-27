/**
 * Shared only between the mock auth server and the mock API server, which
 * run as two independent local processes for the E2E suite. Not a real
 * secret -- a fixed literal both processes import so the mock API server
 * can verify `access_token`s issued by the mock auth server with zero
 * inter-process coordination (no shared filesystem, no handshake).
 */
export const ACCESS_TOKEN_SECRET = "e2e-mock-access-token-secret";
