# Backend Change — Nutrition Targets on Server (§9)

**PRD coverage:** §4.6, §8 (targets get/set), §9. This is the **only** backend
change required for iOS v1 (decision #8). It is purely additive: the web app keeps
using `localStorage` until it opts in (the web migration is a separate,
non-blocking follow-up).

**Goal:** a per-user `food_diary.nutrition_target` table, tracked in Hasura with
`user` role permissions and upsert support, so iOS (and later web) can read/write
targets that drive the diary-list rings.

---

## 1. Migration

Follow the repo's Hasura migration convention
(`graphql-engine/migrations/default/<timestamp>_<name>/{up,down}.sql`). Create a
new timestamped folder, e.g. `<ts>_create_nutrition_target/`.

`up.sql`:
```sql
CREATE TABLE food_diary.nutrition_target (
    user_id text NOT NULL PRIMARY KEY,
    calories numeric NOT NULL DEFAULT 2000,
    calories_max numeric NOT NULL DEFAULT 2400,
    protein_grams numeric NOT NULL DEFAULT 130,
    dietary_fiber_grams numeric NOT NULL DEFAULT 25,
    added_sugars_grams numeric NOT NULL DEFAULT 25,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reuse the existing updated_at trigger function from the init migration.
CREATE TRIGGER set_food_diary_nutrition_target_updated_at
    BEFORE UPDATE ON food_diary.nutrition_target
    FOR EACH ROW
    EXECUTE FUNCTION food_diary.set_current_timestamp_updated_at();
```

`down.sql`:
```sql
DROP TABLE food_diary.nutrition_target;
```

> `set_current_timestamp_updated_at()` already exists (defined in
> `1664466824542_init/up.sql`), so the trigger reuses it — no new function needed.

Defaults match the web app's `DEFAULT_TARGETS` (`web/src/NutritionTargets.tsx`)
and PRD §4.6: 2000 / 2400 / 130 / 25 / 25.

---

## 2. Hasura metadata

### 2.1 Track the table
Add `food_diary_nutrition_target.yaml` under
`graphql-engine/metadata/databases/default/tables/` and register it in
`tables.yaml` (alphabetical, with the other `"!include ..."` entries).

### 2.2 `user` role permissions (§9)
Model them on `food_diary_nutrition_item.yaml` (same `user_id`-scoped pattern):

```yaml
table:
  name: nutrition_target
  schema: food_diary
insert_permissions:
  - role: user
    permission:
      check:
        user_id:
          _eq: X-Hasura-User-Id
      set:
        user_id: x-hasura-User-Id
      columns:
        - calories
        - calories_max
        - protein_grams
        - dietary_fiber_grams
        - added_sugars_grams
select_permissions:
  - role: user
    permission:
      columns:
        - user_id
        - calories
        - calories_max
        - protein_grams
        - dietary_fiber_grams
        - added_sugars_grams
        - updated_at
      filter:
        user_id:
          _eq: X-Hasura-User-Id
update_permissions:
  - role: user
    permission:
      columns:
        - calories
        - calories_max
        - protein_grams
        - dietary_fiber_grams
        - added_sugars_grams
      filter:
        user_id:
          _eq: X-Hasura-User-Id
      check: null
      set:
        user_id: x-hasura-User-Id
delete_permissions:
  - role: user
    permission:
      filter:
        user_id:
          _eq: X-Hasura-User-Id
```

> The `user_id` is server-derived from the JWT (`set: user_id: x-hasura-User-Id`);
> the iOS app **never** sends it (PRD §3).

### 2.3 Enable upsert (`on_conflict`)
For the save path the app uses `insert ... on_conflict` keyed on the `user_id`
primary key (PRD §9). Hasura exposes `on_conflict` automatically when the table
has a unique/primary key **and** the `user` role has both insert and update
permissions on the conflicting columns — which §2.2 grants. Confirm
`insert_food_diary_nutrition_target_one(object:, on_conflict: {constraint:
nutrition_target_pkey, update_columns: [...]})` appears in the schema after apply.

---

## 3. GraphQL operations the iOS app will use (§8)

These are implemented in the iOS `Api.swift` (Phase 1) but specified here so the
metadata above is verified to support them:

**Get targets** (returns 0 or 1 row):
```graphql
query GetNutritionTargets {
  food_diary_nutrition_target {
    calories
    calories_max
    protein_grams
    dietary_fiber_grams
    added_sugars_grams
  }
}
```

**Upsert targets** (save path):
```graphql
mutation SetNutritionTargets($target: food_diary_nutrition_target_insert_input!) {
  insert_food_diary_nutrition_target_one(
    object: $target
    on_conflict: {
      constraint: nutrition_target_pkey
      update_columns: [calories, calories_max, protein_grams, dietary_fiber_grams, added_sugars_grams]
    }
  ) {
    user_id
  }
}
```

App behavior (PRD §9): on launch, run `GetNutritionTargets`; if no row, use
`NutritionTargets.default` and create on first save via the upsert. Cache in
memory for the session (online-only).

---

## 4. Apply & verify

```bash
cd graphql-engine
hasura migrate apply
hasura metadata apply
```
(Use the project's existing Hasura CLI config/endpoint/admin-secret, per the
graphql-engine README.)

**Verify:**
- `GetNutritionTargets` returns `[]` for a fresh user.
- `SetNutritionTargets` inserts a row; a second call with the same user updates
  it (no duplicate, `updated_at` advances).
- A second user cannot see the first user's row (RLS filter).

---

## 5. Follow-up (not blocking iOS — PRD §9)

Migrate the **web** app from `localStorage` (`web/src/NutritionTargets.tsx`) to
this table for true cross-platform sync. Track as a separate task in `web/`. Until
then, web and iOS targets diverge — acceptable per the PRD.

---

## 6. Definition of Done

- Migration up/down apply cleanly; `down` fully reverts.
- Table tracked; `user` role insert/select/update/delete + `on_conflict` work and
  are RLS-scoped by `user_id`.
- The two operations in §3 succeed end-to-end against a real JWT.
- Included in the §17 manual-setup checklist as "apply migration + metadata".
</content>
