import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateJWT } from "./auth.js";
import { registerTools } from "./tools.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3032", 10);
const SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? "motingo.auth0.com";

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: `${SERVER_URL}/mcp`,
    authorization_servers: [`https://${AUTH0_DOMAIN}/`],
    bearer_methods_supported: ["header"],
  });
});

function extractBearerToken(req: express.Request): string | null {
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

  res.on("finish", () => {
    transport.close();
    server.close();
  });
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
});
