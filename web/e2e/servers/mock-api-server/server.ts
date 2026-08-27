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

type AuthedHandler = (ctx: RequestContext, sub: string) => void | Promise<void>;

/**
 * No `/__test__/*` HTTP endpoints here on purpose -- a test driver reaching
 * around the UI to poke bespoke server-internals routes isn't testing the
 * contract a real backend (or a rewrite's replacement mock) would have to
 * honor. `store` is exposed as a plain constructor parameter instead, so
 * *this repo's own* unit tests can construct a fresh one directly rather
 * than resetting a shared instance over the network; the E2E suite needs no
 * equivalent at all, since Playwright spawns a fresh process per run.
 */
export function createMockApiServer(
  store: MockApiStore = new MockApiStore(),
): Server {
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

  return createServer(router.toRequestListener());
}
