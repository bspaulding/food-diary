# food-diary

A food journaling app available at [food-diary.motingo.com](https://food-diary.motingo.com).

This monorepo contains three components:

| Component | Description |
|---|---|
| [`web/`](web/) | SolidJS frontend (TypeScript, Vite, Tailwind) |
| [`graphql-engine/`](graphql-engine/) | Hasura GraphQL engine — migrations, metadata, and tests |
| [`nutrition-fact-labeller/`](nutrition-fact-labeller/) | Rust/Warp OCR service — parses nutrition label images |
| [`llm-nutrition-api/`](llm-nutrition-api/) | Rust/Warp LLM service — looks up / estimates nutrition info from text |

## Local Development

### Prerequisites

```bash
brew install overmind   # process manager — requires tmux
```

### Setup

```bash
cp .env.example .env
# fill in HASURA_GRAPHQL_ADMIN_SECRET and HASURA_GRAPHQL_JWT_SECRET in .env
```

`HASURA_GRAPHQL_ADMIN_SECRET` can be any strong random string. `HASURA_GRAPHQL_JWT_SECRET` must be a JSON object in the format Hasura expects. Generate both with:

```bash
# Admin secret — any random string works
openssl rand -hex 32

# JWT secret — HS256 key wrapped in Hasura's JSON format
echo "{\"type\": \"HS256\", \"key\": \"$(openssl rand -hex 32)\"}"
```

Paste the `{"type": ...}` output as the value of `HASURA_GRAPHQL_JWT_SECRET` in `.env`.

### Run everything

```bash
overmind start
```

This starts all three services with proxies wired to local backends:

| Process | URL |
|---|---|
| `web` | https://localhost:3000 |
| `graphql` | http://localhost:8080 |
| `labeller` | http://localhost:3030 |
| `llm` | http://localhost:3031 |

Vite proxies `/api/*` → Hasura and `/labeller/*` → the OCR service, mirroring the production ingress routing.

### Useful Overmind commands

```bash
overmind restart labeller          # restart just the Rust service
overmind connect labeller          # attach a tmux pane for input/inspection
overmind stop graphql              # stop a single service
```

### Hasura console

```bash
hasura console --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

### New database setup (first time or after reset)

```bash
hasura migrate apply --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
hasura metadata apply --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

## Development

See each component's README for full details:

- [web/README.md](web/README.md)
- [graphql-engine/README.md](graphql-engine/README.md)
- [nutrition-fact-labeller/README.md](nutrition-fact-labeller/README.md)
- [llm-nutrition-api/README.md](llm-nutrition-api/README.md)

## Container Images

Images are published to GHCR on every push to `main` and on version tags:

| Image | Tag pattern |
|---|---|
| `ghcr.io/bspaulding/food-diary/web` | `web-v1.2.3` → `:v1.2.3` |
| `ghcr.io/bspaulding/food-diary/graphql-engine` | `graphql-engine-v1.2.3` → `:v1.2.3` |
| `ghcr.io/bspaulding/food-diary/nutrition-fact-labeller` | `nutrition-fact-labeller-v1.2.3` → `:v1.2.3` |
| `ghcr.io/bspaulding/food-diary/llm-nutrition-api` | `llm-nutrition-api-v1.2.3` → `:v1.2.3` |
