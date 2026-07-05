# MCP Connector for Food Diary

## MCP Primer

**MCP (Model Context Protocol)** is an open standard (Anthropic, Nov 2024) that lets Claude interact with external tools and data sources in a structured way — a plugin system for Claude.

**Tools** — Functions Claude can call. Each has a name, description, and typed input schema. Claude decides when to call one, calls it, gets back a result, and incorporates it into its response.

**MCP Server** — A process that exposes tools. It speaks a JSON-RPC protocol either over stdin/stdout (stdio transport, for local desktop use) or HTTPS (Streamable HTTP transport, for remote/mobile use).

**The transport choice matters for reach:**
- **stdio**: Claude starts the server as a local child process. Works only in Claude Desktop and Claude Code. Does not work on claude.ai or mobile.
- **Streamable HTTP**: The server is a hosted HTTPS endpoint. Works everywhere: claude.ai web, iOS, Android, Desktop, Claude Code. This is the right choice here.

**How Claude.ai adds a connector:** Settings → Connectors → Add Custom Connector → enter URL. Syncs to mobile, web, and desktop automatically.

---

## Context

The food diary needs an MCP connector so Claude can read nutrition/diary data for health & nutrition planning, and log entries and create food items/recipes. The constraint: call Hasura's existing GraphQL API with proper JWT auth — no direct DB access, no new bespoke API. Must work on mobile (claude.ai / iOS / Android), which requires a remote HTTPS server.

---

## Questions from Research

**Does Hasura support MCP out of the box?**
No, not for Hasura v2. Their `promptql-mcp` server is for Hasura DDN (v3), not applicable here.

**Does an OSS generic GraphQL→MCP proxy exist?**
Yes: `blurrah/mcp-graphql` and `toolprint/mcp-graphql-forge` both do this. `mcp-graphql-forge` even supports `--transport http` for remote deployment. However, neither handles OAuth 2.1 auth (they take static headers only), so we'd still need to solve JWT refresh for a hosted server.

**The cleanest approach**: use a custom server (~200 lines TypeScript) that handles auth correctly rather than wrapping a generic tool that doesn't.

---

## Architecture: Remote MCP Server with Auth0 JWT Pass-Through

The elegant insight: **Claude.ai's connector OAuth flow IS the Auth0 login**. Claude.ai handles PKCE with Auth0, gets a JWT, and passes it to the MCP server as a Bearer token. The MCP server validates it (same HS256 key Hasura uses) and forwards it to Hasura. One JWT, used for both hops.

```
User (mobile/web/desktop)
  → adds connector URL in Claude.ai settings
  → Claude.ai does OAuth 2.1 PKCE with Auth0 (same tenant, same audience)
  → Auth0 issues JWT (same format Hasura already validates)
  → Claude.ai stores JWT, presents it to MCP server on each tool call

Claude calls a tool:
  Claude.ai → POST /mcp (Bearer: <auth0-jwt>)
    → MCP server validates JWT (HS256 key, audience check)
    → MCP server POSTs to Hasura /v1/graphql (Authorization: Bearer <same-jwt>)
    → Hasura validates JWT, applies RLS via X-Hasura-User-Id claim
    → Returns data → MCP server returns tool result → Claude uses in response
```

No credential storage on the server. Access tokens are 1-hour stateless JWTs. Alongside each access token the server issues a long-lived refresh token (default 30 days, sliding) so Claude.ai can renew silently via `grant_type=refresh_token` without prompting for login. The refresh token is itself a stateless signed JWT: it carries the Auth0 refresh token in an AES-256-GCM-encrypted `a0rt` claim (key derived from the Hasura JWT secret via HKDF), uses a distinct audience (`food-diary-mcp-refresh`) so it can never be replayed as an access token, and requires no server-side storage — deploys and restarts don't invalidate it. Each refresh round-trips Auth0's token endpoint (so revoking the Auth0 grant kills access) and returns a re-wrapped refresh token, which also makes Auth0 refresh-token rotation work transparently.

---

## Auth0 Changes Required

The current Auth0 application is a SPA (PKCE, no client secret). Claude.ai's OAuth connector flow also uses PKCE.

**Recommendation: reuse the existing SPA app.** Just add the Claude.ai connector callback URL to its "Allowed Callback URLs" list. Auth0 allows multiple redirect URIs per app, so there's no conflict with the web app's existing callback.

**Why you might create a second app instead**: If you want to be able to revoke the MCP connector's access independently of the web app (e.g. "disable Claude from accessing my diary" without logging out of the web app), a separate app lets you do that by deleting/disabling just that app. It also produces cleaner Auth0 logs — tokens issued for the MCP connector show the connector's client ID rather than the web app's. For a personal tool where you're the only user, this distinction rarely matters.

**Conclusion for now**: start by reusing the existing app (just add the callback URL). Create a second app later if you want cleaner separation.

The Claude.ai connector callback URL is provided in the connector setup flow — typically `https://claude.ai/oauth/callback`. Add it to the existing app's Allowed Callback URLs in the Auth0 dashboard.

**Refresh token checklist (required for silent renewal — without these, Claude prompts for re-login every hour):**

1. **API** (`https://direct-satyr-14.hasura.app/v1/graphql`) → Settings → enable **"Allow Offline Access"**. Without this, Auth0 silently drops the `offline_access` scope, returns no refresh token, and the server degrades to access-token-only (today's hourly re-auth behavior) — so this can be flipped on before or after deploying the code.
2. **Application** → Settings → Advanced Settings → Grant Types → ensure **Refresh Token** is checked.
3. **Application** → Refresh Token Rotation/Expiration: rotation on or off both work (the server re-wraps whatever token Auth0 returns). If rotation is on, set a reuse interval of ~10–30 seconds to tolerate request races. Set idle/absolute lifetimes ≥ 30 days (the server's refresh-token TTL), or accept that Auth0 expiry forces a re-login first — either way the failure mode is a clean `invalid_grant` and Claude re-runs the login flow.

---

## Recommended Implementation

### `mcp-server/` directory

```
mcp-server/
├── package.json
├── tsconfig.json
├── Dockerfile            # Builds the deployable image
└── src/
    ├── index.ts          # Express app + MCP StreamableHTTP transport
    ├── auth.ts           # JWT validation (HS256, audience, expiry)
    ├── graphql.ts        # Thin fetch wrapper → Hasura
    └── tools.ts          # Static tool definitions and GraphQL query strings
```

**Key dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.x",
  "express": "^4.x",
  "jsonwebtoken": "^9.x"
}
```

### `src/index.ts` — HTTP server + MCP wiring

Uses the MCP SDK's `StreamableHTTPServerTransport`. Each HTTP request to `/mcp` gets its own MCP session. The Bearer JWT from the `Authorization` header is extracted, validated in `auth.ts`, then threaded through to every tool call.

### `src/auth.ts` — JWT validation

Validates the incoming Auth0 JWT using the same `HASURA_GRAPHQL_JWT_SECRET` (HS256 key) already in the `.env`. Checks signature, audience (`https://direct-satyr-14.hasura.app/v1/graphql`), and expiry. Returns the decoded payload (including `X-Hasura-User-Id` claim) or throws.

This is ~30 lines using the `jsonwebtoken` package.

### `src/graphql.ts` — Hasura client

Same pattern as `web/src/Api.ts` — a typed `gql<T>(jwt, query, variables)` fetch wrapper. ~25 lines.

### `src/tools.ts` — Static tool definitions

Tools are defined explicitly in code. Each tool has a semantic name and description optimized for LLM understanding, an explicit JSON Schema input definition, and a handler that constructs and executes the corresponding GraphQL query/mutation. GraphQL strings live alongside the tool definitions (same pattern as `web/src/Api.ts`).

When the Hasura schema changes significantly, a developer updates the relevant tool definitions manually.

No `graphql` package needed — just raw fetch calls with string query literals.

**Read tools:**

| Tool | Description | GraphQL operation |
|------|-------------|-------------------|
| `list_diary_entries` | List food diary entries for a date range | `food_diary_diary_entry(where: {consumed_at: {_gte, _lte}}, order_by, limit)` with `nutrition_item` and `recipe` relationships |
| `search_food` | Search nutrition items and recipes by name (fuzzy) | `food_diary_search_nutrition_items` + `food_diary_search_recipes` |

**Write tools (create + update for each entity):**

| Tool | Description | GraphQL operation |
|------|-------------|-------------------|
| `create_diary_entry` | Log a food item or recipe with a serving count and date | `insert_food_diary_diary_entry_one` |
| `update_diary_entry` | Update servings or date on an existing diary entry | `update_food_diary_diary_entry_by_pk` |
| `delete_diary_entry` | Remove a diary entry | `delete_food_diary_diary_entry_by_pk` |
| `create_nutrition_item` | Create a new food item with full macro data | `insert_food_diary_nutrition_item_one` |
| `update_nutrition_item` | Update fields on an existing nutrition item | `update_food_diary_nutrition_item_by_pk` |
| `create_recipe` | Create a recipe composed of existing nutrition items | `insert_food_diary_recipe_one` with nested `recipe_items` |
| `update_recipe` | Update a recipe's name, description, or ingredient list | `update_food_diary_recipe_by_pk` + manage `recipe_items` |

Tool descriptions and return shapes are written for LLM consumption: human-readable field names in descriptions, only the most relevant fields in responses (item name, calories, key macros), with IDs included so Claude can chain tools (e.g. search → log).

### Environment variables (server-side)

```
HASURA_GRAPHQL_URL=https://direct-satyr-14.hasura.app/v1/graphql
HASURA_GRAPHQL_JWT_SECRET={"type":"HS256","key":"<secret>"}
AUTH0_AUDIENCE=https://direct-satyr-14.hasura.app/v1/graphql
PORT=3032
REFRESH_TOKEN_TTL=30d   # optional; lifetime of issued refresh tokens (jsonwebtoken duration format)
```

Reuses the JWT secret already in the cluster's secret store. No admin secret. No user credentials. The user's JWT comes from Claude.ai's session on each request and is used for both JWT validation and Hasura calls.

### Kubernetes deployment (primary)

The `Dockerfile` in `mcp-server/` produces an image built and pushed to the cluster registry alongside the existing service images. A `k8s/mcp-server.yaml` manifest (Deployment + Service + Ingress) is added to the repo. The Deployment references the same Kubernetes Secrets already used by the Hasura deployment (`HASURA_GRAPHQL_JWT_SECRET`). No admin secret needed at runtime — only the JWT secret for validating incoming tokens from Claude.ai.

Once running behind the cluster's TLS ingress, the connector URI is `https://<your-cluster-host>/mcp`. This is the URL you enter once in Claude.ai settings, after which it works from every Claude surface (web, iOS, Android, Desktop) signed into your account.

The running container holds only the JWT secret (for validating Claude.ai's tokens). All Hasura calls use the user's own JWT from each request. No admin credentials anywhere on the server.

---

## End-to-End Setup & Connection Flow

### One-time setup (you do this)

**Step 1 — Auth0 (~2 min)**
Add the Claude.ai connector callback URL to your Auth0 app's Allowed Callback URLs. No new app needed if reusing the existing one.

**Step 2 — Build and deploy to the cluster**
Build and push the Docker image to the cluster registry. Apply `k8s/mcp-server.yaml`. Once running behind the cluster's TLS ingress, the connector URI is `https://<your-cluster-host>/mcp`.

**Step 3 — Add connector in Claude.ai**
Settings → Connectors → Add Custom Connector → enter `https://<your-cluster-host>/mcp`

In Advanced settings: enter the Auth0 Client ID (your app) — no client secret needed for a PKCE/SPA app.

### First connection (automatic, ~15 seconds)

Claude.ai detects the MCP server requires OAuth (via the `/.well-known/oauth-protected-resource` endpoint the server exposes). It redirects you to Auth0 login. You log in with your normal food diary credentials. Claude.ai gets a JWT and stores it for the session.

**This syncs to iOS, Android, and Claude Desktop automatically** — configure once on the web, works everywhere.

### Every subsequent use

Claude.ai presents the stored JWT on each tool call. The MCP server validates it and calls Hasura. When the 1-hour access token expires, the server's 401 carries a `WWW-Authenticate` header pointing at the OAuth metadata, and Claude.ai silently exchanges its refresh token at `/token` (`grant_type=refresh_token`) for a fresh access token — the server renews the upstream Auth0 token in the same exchange and hands back a re-wrapped refresh token. No login prompt. A full interactive re-authorization is only needed if the refresh token itself expires (default 30 days idle), the Auth0 grant is revoked, or Auth0's refresh-token lifetime is exceeded.

### Using it in Claude

You talk naturally. Claude sees the available tools and calls them as needed:

- *"What did I eat this week?"* → `list_diary_entries` with date filter
- *"Find me low-sugar options from my food items"* → `search_food`
- *"Log 1.5 servings of oatmeal for breakfast"* → `search_food` to get the ID → `create_diary_entry`
- *"Create a nutrition item for homemade granola"* → `create_nutrition_item`
- *"Update that oatmeal entry to 2 servings"* → `update_diary_entry`

Your food diary data stays in your database. Claude reads and writes through Hasura's GraphQL API with your Auth0 JWT — the same auth path as the web app.

---

## What Tools Claude Gets

**Read (2 tools):**
- `list_diary_entries` — list diary entries for a date range, returns item/recipe names, calories, key macros, and IDs
- `search_food` — fuzzy search across nutrition items and recipes by name; returns name, calories, key macros, and IDs (use IDs to chain into create/update tools)

**Write (7 tools):**
- `create_diary_entry` — log a nutrition item or recipe with a serving count and date
- `update_diary_entry` — change the serving count or date on an existing diary entry
- `delete_diary_entry` — remove a diary entry by ID
- `create_nutrition_item` — create a new food item with calorie and macro data
- `update_nutrition_item` — update any field on an existing nutrition item
- `create_recipe` — create a recipe with a name, description, and list of ingredient items
- `update_recipe` — update a recipe's name, description, or ingredient list

Note: The `protein` and `added_sugar` computed fields are not exposed on `diary_entry` for the user role. Per-entry nutrition data is retrieved through the `nutrition_item { protein_grams, added_sugars_grams }` relationship (works fine).

---

## Implementation Sequence

1. **Auth0** — add the Claude.ai connector callback URL to Allowed Callback URLs (~2 min)
2. **Scaffold `mcp-server/`** — `package.json`, `tsconfig.json`, `Dockerfile`
3. **`src/auth.ts`** — JWT validation using the existing HS256 secret (~30 lines)
4. **`src/graphql.ts`** — Hasura fetch wrapper, port pattern from `web/src/Api.ts` (~25 lines)
5. **`src/tools.ts`** — static tool definitions with inline GraphQL strings (2 read + 7 write tools)
6. **`src/index.ts`** — Express + `StreamableHTTPServerTransport`, JWT extraction per request
7. **Add `k8s/mcp-server.yaml`** — Deployment + Service + Ingress manifests
8. **Build image, push to cluster registry, apply manifests**
9. **Add connector in Claude.ai** — Settings → Connectors → enter `https://<cluster-host>/mcp`, auth with Auth0
10. **Validate on mobile** — open Claude on iOS/Android, ask about diary entries, log an entry

---

## Key Files for Reference

- `web/src/Api.ts` — definitive reference for GraphQL queries, TypeScript types, Hasura patterns
- `web/src/Auth0.ts` — Auth0 domain (`motingo.auth0.com`), current client ID, audience
- `graphql-engine/metadata/databases/default/tables/` — exact columns/computed fields exposed per role
- `.env.example` — `HASURA_GRAPHQL_JWT_SECRET` format (HS256 JSON)

---

## Verification

1. Deploy the server and hit `https://<cluster-host>/mcp` — should return MCP handshake
2. Add connector in Claude.ai, complete Auth0 login
3. Ask Claude: *"What did I eat last week?"* — should call `list_diary_entries`
4. Ask Claude: *"Find me my oatmeal item"* — should call `search_food`
5. Ask Claude: *"Log 1 serving of oatmeal for today"* — should chain `search_food` → `create_diary_entry`
6. Open Claude on iOS, repeat — should work identically
