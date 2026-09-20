# Postgres 14 → 18 Upgrade Plan

## Summary

We currently run Postgres 14 everywhere (local dev, CI, and production). This
plan upgrades to Postgres 18 (the current latest major version as of this
writing), which also carries the metadata database for our Hasura
`graphql-engine` (v2.50.3) instance — Postgres, `pg_trgm`, `pgcrypto`, and the
`hdb_catalog` schema all live in one instance.

**This plan was validated end-to-end** using a production backup
(`d427d5d3-food-diary-2026-09-20-0122.sql`, dumped from Postgres 14.24) by:

1. Loading the dump into a `postgres:14-alpine` container (clean load, zero errors).
2. Running `pg_dump` against it and restoring straight into a `postgres:18-alpine`
   container (clean restore, zero errors, zero warnings).
3. Verifying row counts for every `food_diary.*` table matched exactly
   (`diary_entry`: 4771, `nutrition_item`: 2341, `recipe`: 32, `recipe_item`: 106).
4. Confirming `pg_trgm` and `pgcrypto` extensions, all `food_diary.*` functions,
   views, and triggers work unchanged (e.g. `diary_entry_added_sugar`,
   `search_nutrition_items`, `calories_per_day`, `most_logged_entries`, the
   `gin_trgm_ops` indexes).
5. Pointing `hasura/graphql-engine:v2.50.3` at the restored Postgres 18
   database — it started cleanly, reported `"Already at the latest catalog
   version (48); nothing to do"` for `hdb_catalog`, passed `/healthz`, and
   served a real GraphQL query (`food_diary_recipe`) successfully.

Conclusion: there is **no schema/extension/Hasura compatibility blocker** to
upgrading straight from 14 to 18. A dump/restore upgrade is safe.

## Why dump/restore instead of `pg_upgrade`

The production database is small (a few thousand rows, ~1MB `pg_dump`
output). Given the size:

- A logical dump/restore (`pg_dump` | `psql`, or `pg_dumpall`) takes seconds
  and needs no special binaries inside the container beyond what's already
  there.
- `pg_upgrade` (in-place, keeps data files) is designed to avoid downtime on
  large databases, but requires running old and new `postgres` binaries
  side-by-side against the same data directory — awkward in the single-image
  Alpine StatefulSet setup we have (`docker.io/postgres:14-alpine`), and not
  worth the added complexity for a database this size.
- Dump/restore also gives us a clean opportunity to validate the restored
  data (row counts, spot queries) before cutting over, and a trivial rollback
  (leave the old PVC alone until the new one is verified).

## Current state

| Component | Where | Current | Target |
|---|---|---|---|
| Local dev DB | `graphql-engine/docker-compose.yml` | `postgres:14` | `postgres:18` |
| CI test DB | `graphql-engine/docker-compose.test.yml` | `postgres:14` | `postgres:18` |
| Production DB | `motingo-gitops/food-diary.yaml` (`food-diary-db` StatefulSet) | `docker.io/postgres:14-alpine` | `docker.io/postgres:18-alpine` |
| Backup cronjob | `motingo-gitops/food-diary.yaml` (`food-diary-db-backup` CronJob) | `docker.io/bspaulding/pgdumpbox:14-alpine` | needs a Postgres-18-compatible `pg_dump` client (rebuild/retag `pgdumpbox`, or replace with a stock `postgres:18-alpine` image running the same dump script) |
| Hasura | both repos | `hasura/graphql-engine:v2.50.3` | unchanged — already confirmed compatible |

## Rollout steps

### 1. Local & CI first (low risk)
- Bump `postgres:14` → `postgres:18` (or `postgres:18-alpine` for parity with
  prod) in `graphql-engine/docker-compose.yml` and
  `graphql-engine/docker-compose.test.yml`.
- Run the existing Hasura migrations against a fresh Postgres 18 container to
  confirm `hasura migrate apply` / `hasura metadata apply` still succeed
  (they should — migrations are plain SQL/DDL, nothing 14-specific was found
  in `graphql-engine/migrations/`).
- Let CI (`.github/workflows/ci-cd.yml`, the `docker compose ... up postgres
  graphql-engine` step) run green on Postgres 18 before touching production.

### 2. Production cutover

> **Do not simply bump the image tag on the existing `food-diary-db`
> StatefulSet.** Its PVC holds Postgres 14 data files, which are not
> binary-compatible with the Postgres 18 binary — swapping the image in
> place would crash-loop the pod on restart with the existing PVC mounted.
> The StatefulSet's image only moves to `postgres:18-alpine` as part of the
> dump/restore/cutover sequence below (onto a **new** PVC), never as a
> standalone tag edit.

Because this is a single-node StatefulSet with a PVC (no replica to fail
over to), the simplest safe approach is a short maintenance window:

1. **Freeze writes**: scale `food-diary-graphql-engine` and
   `food-diary-mcp-server` Deployments to 0 replicas (or put the frontend in
   maintenance mode) so nothing writes to Postgres mid-migration.
2. **Take a fresh backup**: manually trigger the `food-diary-db-backup`
   CronJob (or run `pg_dump` directly) against the live `food-diary-db` to
   get a dump newer than the one already tested here.
3. **Provision the new database**: create a new PVC/StatefulSet
   (`food-diary-db-pg18`, or reuse the name with a new PVC) running
   `docker.io/postgres:18-alpine`, sized the same as today (1Gi, `do-block-storage`).
4. **Restore**: `pg_dump` from the old instance (or use the fresh backup from
   step 2) and `psql`/`pg_restore` into the new instance, exactly as tested
   above — no owner/privilege flags needed since both run as the `postgres`
   role, and no transformation of the dump is required.
5. **Verify**: compare row counts per table between old and new (same
   queries used in this validation), confirm extensions
   (`pg_trgm`, `pgcrypto`) are present, and point a throwaway
   `hasura/graphql-engine:v2.50.3` container at the new DB to confirm
   `hdb_catalog` migration status and a sample GraphQL query, as done here.
6. **Cut over**: update `food-diary-graphql-engine`'s `PG_DATABASE_URL` /
   `HASURA_GRAPHQL_METADATA_DATABASE_URL` (via the `food-diary-db` Service)
   to point at the new StatefulSet — either by renaming the Service selector
   or swapping the StatefulSet in place behind the existing headless
   `food-diary-db` Service name once the PVC is swapped.
7. **Unfreeze**: scale the Deployments back up, smoke-test the app
   (`food-diary.motingo.com`), then re-enable the backup CronJob (pointed at
   the new client image, see below).
8. **Keep the old PVC/StatefulSet around** (don't delete) for a rollback
   window (e.g. a few days) in case something surfaces post-cutover.

### 3. Backup tooling
`bspaulding/pgdumpbox:14-alpine` needs a `pg_dump` client new enough to talk
to Postgres 18 (pg_dump is generally forward-compatible with newer servers
within reason, but should be rebuilt/retagged e.g. `pgdumpbox:18-alpine` to
stay in lockstep and avoid silently missing newer catalog features). This
image lives outside `food-diary`/`motingo-gitops` (a separate
`bspaulding/pgdumpbox` repo/Docker Hub image) — out of scope for this repo
pair, but flagged here so it isn't missed before the backup CronJob runs
again post-upgrade.

## Risks / things to double check

- **Extension version drift**: `pg_trgm` and `pgcrypto` come bundled with the
  Postgres image; the validated restore picked up `pg_trgm 1.6` /
  `pgcrypto 1.4` automatically via `CREATE EXTENSION IF NOT EXISTS` — no
  action needed, but worth eyeballing `\dx` after the real cutover.
- **Alpine base image change**: Postgres 18's Alpine image may pull a newer
  Alpine/musl base than 14's; low risk for a stateless-config service like
  this, but worth a quick `docker pull` sanity check on the deploy host
  ahead of the maintenance window.
- **Storage class / PVC**: confirm `do-block-storage` still provisions
  correctly for a new PVC in the target cluster before the maintenance
  window (not something this local test could verify).
- **`use_prepared_statements`/session settings**: Hasura's default config
  worked as-is in testing; no server-side `postgresql.conf` tuning currently
  exists in these repos to port over.
- **Downtime**: expect a few minutes of write-downtime for step 2 (backup) +
  step 4 (restore) + step 6 (cutover) — dump/restore of this dataset takes
  low single-digit seconds; most of the window is verification and DNS/
  service cutover, not data transfer.

## Rollback

If anything looks wrong after cutover, just point `PG_DATABASE_URL` /
`HASURA_GRAPHQL_METADATA_DATABASE_URL` back at the untouched Postgres 14
StatefulSet/PVC (kept alive through step 8 above) and scale the app back up.
No data was mutated on the old instance during the test/cutover, so this is
a clean revert.
