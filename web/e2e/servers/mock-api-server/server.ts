import { createServer, type Server } from "node:http";
import {
  createRouter,
  readJsonBody,
  readRawBody,
  sendJson,
  type RequestContext,
} from "../shared/httpServer.ts";
import { verifyAccessToken } from "./auth.ts";
import { resolveOperation } from "./resolvers.ts";
import { handleLookup, handleUpload } from "./restHandlers.ts";
import { MockApiStore } from "./store.ts";

type GraphQLRequestBody = {
  query: string;
  variables?: Record<string, unknown>;
};
type LookupRequestBody = { description: string };
type ForceErrorRequestBody = { status?: number; times?: number };
type ClockRequestBody = { now?: string };

type AuthedHandler = (ctx: RequestContext, sub: string) => void | Promise<void>;

export function createMockApiServer(): Server {
  const store = new MockApiStore();
  const router = createRouter();

  function withAuth(handler: AuthedHandler) {
    return (ctx: RequestContext): void | Promise<void> => {
      const auth = verifyAccessToken(ctx.req);
      if (!auth) {
        sendJson(ctx.res, 401, {
          error: "unauthorized",
          error_description: "Missing, invalid, or expired access token",
        });
        return;
      }
      // Applies to every authenticated endpoint, not just /v1/graphql --
      // the E2E session-expiry test just needs "the next authenticated
      // call fails," regardless of which UI action triggers it.
      const armedStatus = store.consumeArmedError();
      if (armedStatus !== null) {
        sendJson(ctx.res, armedStatus, {
          errors: [
            {
              message: `mock server: forced ${armedStatus} via /__test__/force-error`,
            },
          ],
        });
        return;
      }
      return handler(ctx, auth.sub);
    };
  }

  router.on(
    "POST",
    "/v1/graphql",
    withAuth(async ({ req, res }, sub) => {
      const body = await readJsonBody<GraphQLRequestBody>(req);
      const query = body.query ?? "";
      const variables = body.variables ?? {};
      const result = resolveOperation(query, variables, store, sub);
      if (!result) {
        sendJson(res, 500, {
          errors: [
            {
              message: `mock server: unhandled operation in query: ${query.slice(0, 120)}`,
            },
          ],
        });
        return;
      }
      sendJson(res, 200, { data: result });
    }),
  );

  router.on(
    "POST",
    "/lookup",
    withAuth(async ({ req, res }) => {
      const body = await readJsonBody<LookupRequestBody>(req);
      sendJson(res, 200, handleLookup(body.description ?? ""));
    }),
  );

  router.on(
    "POST",
    "/upload",
    withAuth(async ({ req, res }) => {
      await readRawBody(req); // drain the multipart body -- content is irrelevant, response is canned
      sendJson(res, 200, handleUpload());
    }),
  );

  router.on("POST", "/__test__/reset", ({ res }) => {
    store.reset();
    sendJson(res, 200, { ok: true });
  });

  router.on("POST", "/__test__/clock", async ({ req, res }) => {
    const body = await readJsonBody<ClockRequestBody>(req);
    if (!body.now) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description: "Missing required field: now",
      });
      return;
    }
    store.setClock(body.now);
    sendJson(res, 200, { ok: true });
  });

  router.on("POST", "/__test__/force-error", async ({ req, res }) => {
    const body = await readJsonBody<ForceErrorRequestBody>(req);
    store.armError(body.status ?? 401, body.times ?? 1);
    sendJson(res, 200, { ok: true });
  });

  router.on("GET", "/__test__/dump", ({ res }) => {
    sendJson(res, 200, store.dump());
  });

  return createServer(router.toRequestListener());
}
