# Phase 4 — Data Portability (CSV Import / Export)

**PRD coverage:** §11 Phase 4; §5 (CSV deferred from v1); §8 (deferred
`ExportEntries*`, `InsertDiaryEntriesWithNewItems`). Web reference:
`web/src/CSVExport.ts`, `web/src/CSVImport.ts`, `web/src/ExportDiaryEntries.tsx`,
`web/src/ImportDiaryEntries.tsx`, and `fetchExportEntries` / `insertDiaryEntries`
in `web/src/Api.ts`.

**Goal:** CSV **export** (share sheet / Files) and CSV **import** (Files picker)
of diary entries, reusing the existing backend operations and matching the web
CSV format exactly for round-trip compatibility.

---

## 1. API (`Api.swift`)

Add (mirror `web/src/Api.ts`):
- `ExportEntries` and `ExportEntriesWithDateRange($startDate,$endDate)` — select
  `servings, consumed_at, nutrition_item { ...nutritionItem }, recipe { name,
  recipe_items { servings, nutrition_item { ...nutritionItem } } }`.
- `InsertDiaryEntriesWithNewItems($entries)` — bulk insert entries with nested new
  `nutrition_item { data: {...} }` (port `insertDiaryEntries`, including the
  snake_case nesting).

## 2. CSV format (port exactly — `web/src/CSVExport.ts` / `CSVImport.ts`)

- **Reuse the web's column order, headers, quoting/escaping, and number
  formatting verbatim** so files exported on web import on iOS and vice-versa.
  Port the serializer/parser as pure Swift functions in `Util/CSV.swift` and
  unit-test against the web's fixtures (this is the correctness crux).
- Handle both item entries and recipe entries as the web does.

## 3. Export feature (`Features/Export/`)

- `ExportViewModel`: optional date range → `fetchExportEntries` → CSV string →
  write to a temp file.
- Present iOS **share sheet** (`UIActivityViewController` / `ShareLink`) and/or
  save to **Files** (`fileExporter`). UTType `.commaSeparatedText`.

## 4. Import feature (`Features/Import/`)

- `ImportViewModel`: `fileImporter` (Files) → read CSV → parse to
  `[NewDiaryEntry]` → preview/confirm → `insertDiaryEntries`.
- Surface parse errors with row context; allow cancel before commit. Match the
  web's validation behavior.

## 5. Navigation

- Add `.exportEntries` / `.importEntries` routes; expose from the Profile/Settings
  toolbar menu.

## 6. Tests

- CSV serialize/parse round-trip vs. **web fixtures** (parity is the whole point).
- `ExportEntries*` and `InsertDiaryEntriesWithNewItems` decode/encode.

## 7. Definition of Done

- Export produces a CSV (optionally date-ranged) shareable via the share sheet /
  Files; import reads a CSV (incl. web-exported files) and inserts entries with
  new items; formats are byte-compatible with the web app.
</content>
