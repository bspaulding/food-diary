import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: URLSearchParams;
};

export type Handler = (ctx: RequestContext) => void | Promise<void>;

type Route = { method: string; path: string; handler: Handler };

export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;

export type Router = {
  on: (method: string, path: string, handler: Handler) => void;
  /** Hand to `http.createServer(...)` -- this module never binds a port
   * itself, so callers decide (a fixed port for the CLI entrypoint, port 0
   * for tests). */
  toRequestListener: () => RequestListener;
};

/**
 * A deliberately tiny router: exact method+pathname matching only, no
 * params/wildcards. Every route this harness needs is a static path, so
 * anything fancier here would just be unused flexibility.
 */
export function createRouter(): Router {
  const routes: Route[] = [];

  function on(method: string, path: string, handler: Handler): void {
    routes.push({ method, path, handler });
  }

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = routes.find(
      (r) => r.method === req.method && r.path === url.pathname,
    );
    if (!route) {
      sendJson(res, 404, {
        error: "not_found",
        error_description: `No handler for ${req.method ?? "?"} ${url.pathname}`,
      });
      return;
    }
    try {
      await route.handler({ req, res, url, params: url.searchParams });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "server_error",
          error_description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  function toRequestListener(): RequestListener {
    return (req, res) => {
      void handleRequest(req, res);
    };
  }

  return { on, toRequestListener };
}

export function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function readJsonBody<T>(
  req: IncomingMessage,
): Promise<Partial<T>> {
  const raw = await readRawBody(req);
  return raw ? (JSON.parse(raw) as Partial<T>) : {};
}

export async function readFormBody(
  req: IncomingMessage,
): Promise<URLSearchParams> {
  const raw = await readRawBody(req);
  return new URLSearchParams(raw);
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function sendHtml(
  res: ServerResponse,
  status: number,
  html: string,
): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function redirectTo(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}
