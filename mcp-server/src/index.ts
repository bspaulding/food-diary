import { fileURLToPath } from "url";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateJWT } from "./auth.js";
import { registerTools } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "3032", 10);
const SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? "motingo.auth0.com";

export const app = express();
app.use(express.json());

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: `${SERVER_URL}/mcp`,
    authorization_servers: [`https://${AUTH0_DOMAIN}/`],
    bearer_methods_supported: ["header"],
  });
});

export function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function handleMcp(req: express.Request, res: express.Response): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  try {
    validateJWT(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const server = new McpServer({ name: "food-diary", version: "1.0.0" });
  registerTools(server, token);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  /* v8 ignore next 4 */
  res.on("finish", () => {
    transport.close();
    server.close();
  });
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

/* v8 ignore next 5 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`MCP server listening on port ${PORT}`);
  });
}
