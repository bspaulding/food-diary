# food-diary

A food journaling app available at [food-diary.motingo.com](https://food-diary.motingo.com).

This monorepo contains two components:

| Component | Description |
|---|---|
| [`web/`](web/) | SolidJS frontend (TypeScript, Vite, Tailwind) |
| [`graphql-engine/`](graphql-engine/) | Hasura GraphQL engine — migrations, metadata, and tests |

## Quick Start

### web

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

To connect to a local backend, update the proxy target in `vite.config.mts`:

```js
target: "http://localhost:8080/"
```

### graphql-engine

```bash
cd graphql-engine
docker-compose up
```

Required environment variables:

```bash
export HASURA_GRAPHQL_ADMIN_SECRET=...
export HASURA_GRAPHQL_JWT_SECRET=...
```

Open the Hasura console:

```bash
hasura console --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

New database setup (migrations + metadata):

```bash
hasura migrate apply --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
hasura metadata apply --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

## Development

See each component's README for full details:

- [web/README.md](web/README.md)
- [graphql-engine/README.md](graphql-engine/README.md)

## Container Images

Images are published to GHCR on every push to `main` and on version tags:

| Image | Tag pattern |
|---|---|
| `ghcr.io/bspaulding/food-diary/web` | `web-v1.2.3` → `:v1.2.3` |
| `ghcr.io/bspaulding/food-diary/graphql-engine` | `graphql-engine-v1.2.3` → `:v1.2.3` |
