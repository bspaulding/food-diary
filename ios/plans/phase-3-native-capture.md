# Phase 3 — Native Capture (Label Scan + LLM Autofill)

**PRD coverage:** §11 Phase 3; §4.4 (deferred camera/LLM on the item form); §3 /
§8 (`/labeller/upload`, `/llm/lookup` sidecars); §14 (confirm sidecar ingress auth
before building). Web reference: `web/src/CameraModal.tsx`,
`web/src/LLMLookupModal.tsx`, `lookupNutritionWithLLM` in `web/src/Api.ts`.

**Goal:** add the two deferred autofill paths to the **nutrition item form**
(Phase 1 §6): (a) camera nutrition-label scan via the Rust OCR sidecar
`/labeller/upload`, and (b) LLM nutrition lookup via `/llm/lookup`. Both populate
the macro fields; the user reviews/edits before saving.

---

## 0. Precondition (PRD §14)

**Confirm the same Bearer JWT is accepted by `/labeller/*` and `/llm/*` via the
ingress before building.** The web app calls `/llm/lookup` without an auth header
(same-origin), but the native client must send `Authorization: Bearer <token>`
from `AuthService`. Verify the ingress authorizes these routes with the user's
Hasura JWT; if not, resolve the ingress/auth config first. This is the gating risk
for the whole phase.

## 1. Networking

These sidecars are **REST, not GraphQL**. Add a small `SidecarClient` (or extend
`GraphQLClient`'s transport) that POSTs to `{BASE}/llm/lookup` and
`{BASE}/labeller/upload` with the bearer token. Base URL from `AppEnvironment`
(same prod/debug switch as GraphQL, §10).

- **LLM:** `POST /llm/lookup` `{ "description": String }` → `{ item: {...
  snake_case macros...} }`. Map to `NutritionItemAttrs` defaulting missing fields
  to 0 (port the field-by-field coercion in `lookupNutritionWithLLM`,
  `web/src/Api.ts:838`). On non-2xx, surface `body.error ?? statusText`.
- **Labeller:** `POST /labeller/upload` multipart with the captured image →
  parsed macro fields (match the web `CameraModal` upload contract / response
  shape). Map into `NutritionItemAttrs`.

## 2. Capture & permissions

- Camera via `VisionKit` `DataScannerViewController` or `AVFoundation` capture +
  optional on-device **Vision** OCR pre-pass (PRD §11 "optional on-device Vision
  pre-pass") to crop/deskew before upload. Start simple: capture a still →
  upload; add the Vision pre-pass only if accuracy needs it.
- `Info.plist`: `NSCameraUsageDescription`.

## 3. Item form integration (`Features/Items/`)

- Add two buttons to `ItemFormView` (parity with web): **Scan label** (camera
  sheet → `/labeller/upload` → prefill) and **Look up** (text → `/llm/lookup` →
  prefill).
- Both populate the form fields and leave the user to review/correct before Save
  (existing Phase 1 `CreateNutritionItem`/`UpdateItem` path unchanged).
- Clear loading + error states per call.

## 4. Tests

- Response decoding for `/llm/lookup` (incl. missing fields → 0) and
  `/labeller/upload`.
- Error mapping (non-2xx → message).
- Macro mapping into `NutritionItemAttrs`.

## 5. Definition of Done

- From the item form, a label photo prefills macros via the OCR sidecar, and a
  text description prefills macros via the LLM sidecar; both authorize with the
  user's JWT through the ingress; the user can edit and save.
</content>
