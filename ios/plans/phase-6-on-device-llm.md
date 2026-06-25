# Phase 6 — On-Device LLM (Gemma 4 E2B)

**PRD coverage:** extends §11 Phase 3 (label scan + LLM lookup) and §4.4 (item
form autofill) with a client-side inference path, alongside the existing
server sidecars from [`phase-3-native-capture.md`](phase-3-native-capture.md).
No PRD section currently anticipates on-device ML; this plan is additive and
should be folded into the PRD's phase table once accepted.

**Goal:** let the nutrition-item form's existing **Look Up** and **Scan
Label** actions run **on-device** via Gemma 4 E2B (Google's edge LLM,
released April 2026), as a user-toggleable alternative to the
`/llm/lookup` / `/labeller/upload` server sidecars — fully offline and
private when enabled, with the same `NutritionAutofillClient` contract so the
rest of `ItemFormViewModel` is unaware which backend served the request.

---

## 0. Decisions locked (from interview, 2026-06-24)

- **Runtime: LiteRT-LM** (`google-ai-edge/LiteRT-LM` Swift package), not
  MediaPipe LLM Inference — Google deprecated MediaPipe's LLM Inference API on
  iOS/Android in favor of LiteRT-LM. This is the **first third-party
  dependency** in the iOS app; the v1 "zero third-party dependencies" rule
  (`ios/plans/README.md` "Locked decisions") is explicitly waived for this
  feature only. Update that README table when this lands.
- **Model:** single multimodal file,
  `litert-community/gemma-4-E2B-it-litert-lm/model.litertlm` (~2.6 GB, mixed
  2/4/8-bit quantization). One file serves **both** features — Gemma 4 E2B's
  vision input handles label-photo OCR/understanding directly, no separate
  Apple Vision OCR pass needed.
- **Label scan input:** direct multimodal (photo → `Content.imageFile` +
  `Content.text` prompt), not a Vision-OCR-then-text pipeline.
- **Server relationship: user-toggleable.** A setting in Profile chooses
  on-device vs. server for both autofill actions; default is decided in §3.
- **Model hosting:** downloaded directly from Hugging Face
  (`https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/model.litertlm`)
  on first on-device use. Not gated/no auth token required (Apache-2.0). No
  new backend hosting work.
- **Device gating:** the on-device toggle is hidden/disabled on devices below
  a minimum RAM/chip bar (§2).
- **Model lifecycle:** lazy-init the `Engine` on first use per app session,
  keep it resident in memory for subsequent calls, release on memory
  pressure / background per §6.

---

## 1. Dependency & project setup

- Add SPM dependency in `FoodDiary.xcodeproj`:
  `https://github.com/google-ai-edge/LiteRT-LM`, version pinned (`from:
  "0.12.0"` or latest tagged release at implementation time — verify current
  tag before pinning).
- If Xcode doesn't auto-link the product, manually add `LiteRTLM` under
  **General → Frameworks, Libraries, and Embedded Content**.
- No `Info.plist` changes needed for the model itself; camera permission
  (`NSCameraUsageDescription`) already exists from Phase 3.
- Add a `Sources/ThirdParty/` note or comment in `ios/README.md` recording
  *why* this dependency exists (only sanctioned exception to the zero-deps
  rule) so it doesn't look accidental in review.

## 2. Device capability gating

- New `DeviceCapability` helper (`FoodDiary/Support/DeviceCapability.swift`):
  reports physical RAM via `ProcessInfo.processInfo.physicalMemory` and
  determine eligibility. Recommend gating at **≥6 GB physical RAM**
  (covers iPhone 13/A15 and newer with headroom; iPhone 12/A14 and older are
  excluded — 2.6 GB model + KV cache + app overhead is tight on 4 GB devices).
  Confirm the exact cutoff empirically once real device testing is possible;
  treat 6 GB as the starting hypothesis, not a hard commitment.
- Simulator: report ineligible (LiteRT-LM GPU/Metal backend behavior on
  simulator is unreliable) — on-device mode requires a physical device; show
  an explanatory message rather than crashing.
- The Profile toggle (§4) calls `DeviceCapability.supportsOnDeviceLLM` and
  hides the control (showing a fixed "Server" mode with a short explanation)
  when `false`.

## 3. Model download manager

New `OnDeviceModelManager` (`FoodDiary/OnDeviceLLM/OnDeviceModelManager.swift`),
`@MainActor @Observable`, owned by `AppEnvironment`:

- **States:** `notDownloaded`, `downloading(progress: Double)`, `ready(path:
  URL)`, `failed(String)`.
- Downloads `model.litertlm` from the Hugging Face `resolve/main` URL above
  via `URLSession.shared.download(for:)` (delegate-based, to report progress),
  writing to `FileManager.default.urls(for: .applicationSupportDirectory,
  ...)` under `OnDeviceLLM/model.litertlm` — **not** Documents (excluded from
  iCloud backup automatically via Application Support; additionally set
  `isExcludedFromBackup` resource value given the file size).
- Resumable: store the partial download and use
  `URLSessionDownloadTask`'s resume-data support if interrupted (App
  Store Wi-Fi-only large-download norms — consider gating the download
  trigger on Wi-Fi via `NWPathMonitor`, surfaced as a "Wi-Fi recommended"
  notice rather than a hard block, since this is a 2.6 GB transfer).
- Exposes `deleteModel()` for the user to free the ~2.6 GB (Profile UI, §4).
- Verifies the downloaded file is non-empty / matches expected size before
  marking `.ready` (no published checksum to verify against currently —
  revisit if Hugging Face exposes one).

## 4. Profile UI — On-Device LLM section

Extend `ProfileView.swift` (new section, alongside existing "Data" section)
and `ProfileViewModel.swift`:

- Toggle: **"Use on-device AI"** (off by default — first run always uses the
  server sidecars; the user opts in, since enabling it triggers a 2.6 GB
  download). Hidden entirely if `!DeviceCapability.supportsOnDeviceLLM`.
- When toggled on and the model isn't downloaded: show a "Download model
  (2.6 GB)" button driving `OnDeviceModelManager`, with a progress bar
  reflecting `.downloading(progress:)`.
- When ready: show "Model ready" + a "Delete model (frees 2.6 GB)" button
  that also flips the toggle back off.
- Persist the toggle preference (`UserDefaults`, key e.g.
  `useOnDeviceLLM`) — read by `AppEnvironment` to decide which
  `NutritionAutofillClient` to hand `ItemFormViewModel` (§7).

## 5. `OnDeviceLLMEngine` — LiteRT-LM wrapper

New `FoodDiary/OnDeviceLLM/OnDeviceLLMEngine.swift`, an `actor` (inference
calls are async and should serialize — only one prompt in flight at a time):

```swift
actor OnDeviceLLMEngine {
    enum EngineError: Error, Equatable { case notReady, inferenceFailed(String) }

    private var engine: Engine?
    private let modelPath: URL

    init(modelPath: URL) { self.modelPath = modelPath }

    private func ensureLoaded() async throws -> Engine {
        if let engine { return engine }
        let config = try EngineConfig(
            modelPath: modelPath.path,
            backend: .gpu,
            visionBackend: .cpu(),
            maxNumTokens: 512,
            cacheDir: NSTemporaryDirectory())
        let newEngine = Engine(engineConfig: config)
        try await newEngine.initialize()
        engine = newEngine
        return newEngine
    }

    func lookupText(prompt: String) async throws -> String { ... }
    func lookupImage(imageData: Data, prompt: String) async throws -> String { ... }
    func unload() { engine = nil }
}
```

- `lookupText`/`lookupImage` create a fresh `Conversation` per call (cheap
  relative to `Engine` init) with a system message constraining output to
  **strict JSON matching the existing macro field names** (mirror the
  `/llm/lookup` response shape: `description`, `calories`,
  `total_fat_grams`, … snake_case keys) — this lets both the on-device and
  server paths feed the **same parsing code** in `OnDeviceAutofillClient`
  (reuse the `string(_:_:)`/`number(_:_:)` helpers already in
  `SidecarClient.swift`, or extract them to a shared file).
- `lookupImage` writes the JPEG to a temp file (LiteRT-LM's `Content.imageFile`
  takes a path, not raw bytes) and passes `Content.imageFile(tempPath)` +
  `Content.text(prompt)`.
- Prompt engineering is the main implementation risk — Gemma 4 E2B must be
  steered hard via the system message to emit parseable JSON with no markdown
  fencing or commentary. Plan for a few iterations against real label photos
  before this is reliable; if JSON parsing fails, retry once with a
  stricter "JSON only, no other text" reminder appended, then surface a
  user-facing error rather than looping indefinitely.

## 6. Lifecycle & memory management

- `OnDeviceLLMEngine` is instantiated once in `AppEnvironment` (lazily — only
  when on-device mode is enabled and the model is `.ready`), held for the app
  session per the "keep resident" decision.
- Subscribe to `UIApplication.didEnterBackgroundNotification` and
  `didReceiveMemoryWarningNotification`: call `engine.unload()` on memory
  warning; on background, unload after a short grace period (e.g. via a
  background task) rather than instantly, so quick app-switches don't force a
  reload. Re-`ensureLoaded()` transparently on the next call.
- Surface load time in the loading state shown to the user (item form's
  existing `AutofillState.loading` per `ItemFormViewModel.swift`) — first
  call after unload may take several seconds.

## 7. `OnDeviceAutofillClient` — same contract as `SidecarClient`

New `FoodDiary/OnDeviceLLM/OnDeviceAutofillClient.swift`, conforming to the
**existing** `NutritionAutofillClient` protocol
(`FoodDiary/Networking/SidecarClient.swift:23`) — this is the key seam that
makes this whole feature additive rather than invasive:

```swift
struct OnDeviceAutofillClient: NutritionAutofillClient {
    let engine: OnDeviceLLMEngine

    func lookupNutrition(description: String) async throws -> NutritionItemInput {
        let json = try await engine.lookupText(prompt: lookupPrompt(for: description))
        return try parseNutritionJSON(json) // shared parsing, §5
    }

    func uploadLabel(imageData: Data) async throws -> NutritionItemInput {
        let json = try await engine.lookupImage(imageData: imageData, prompt: scanPrompt)
        return try parseNutritionJSON(json)
    }
}
```

- Errors map to `SidecarError(message:)` (reuse the existing type — both
  clients throw the same error currency so `ItemFormViewModel`'s
  `AutofillState.error(String)` handling needs no changes).
- **No changes needed to `ItemFormViewModel` or `ItemFormView`** — they
  already take `autofillClient: NutritionAutofillClient?` as a dependency.
  This is the whole point of doing the design work in Phase 3 with a
  protocol seam.

## 8. Wiring in `AppEnvironment`

- Add `onDeviceModelManager: OnDeviceModelManager` and an optional
  `onDeviceLLMEngine: OnDeviceLLMEngine?` (nil until the model is ready and
  the user has opted in).
- Replace the current `sidecarClient: SidecarClient` direct injection into
  `ItemFormViewModel` with a small resolver:

  ```swift
  var autofillClient: NutritionAutofillClient {
      if useOnDeviceLLM, let engine = onDeviceLLMEngine {
          OnDeviceAutofillClient(engine: engine)
      } else {
          sidecarClient
      }
  }
  ```

  read fresh each time `ItemFormViewModel` is constructed, so toggling the
  Profile setting takes effect on the next form open without an app restart.

## 9. Tests

On-device inference itself isn't unit-testable (no model in CI, no GPU on
CI runners) — keep the same "pure logic tested, UI/integration not" line from
`testing.md` §0:

- **`OnDeviceAutofillClient` JSON parsing**: golden JSON strings (including
  malformed/non-JSON model output, missing fields → 0, extra
  markdown-fenced output) → `NutritionItemInput`, mirroring the existing
  `SidecarClientTests.swift` coverage for the server path.
- **`DeviceCapability`**: thresholds against injected `physicalMemory`
  values (inject via a protocol rather than calling `ProcessInfo` directly,
  so the boundary is testable).
- **`OnDeviceModelManager`** state transitions (`notDownloaded` →
  `downloading` → `ready`/`failed`) against a fake `URLSession`/download
  task, not a real 2.6 GB transfer.
- **Resolver logic** in `AppEnvironment` (§8): toggle + engine-readiness →
  correct client chosen — test as a pure function extracted from
  `AppEnvironment`, not by exercising the DI container.
- Explicitly **not** unit tested: actual `Engine`/`Conversation` behavior,
  real model accuracy. Cover those in the manual test plan instead — except
  for the opt-in real-inference evals below, which do cover them.

**Real-inference evals (`OnDeviceLLMEvalTests.swift`):** opt-in smoke tests
that run the actual LiteRT-LM engine against canonical examples (a few
well-known foods for text lookup; real label photos reused from
`nutrition-fact-labeller/images/` + `test_cases.csv` for label scan) and
assert results land within a loose tolerance range — catches "the model
returns garbage/zeros" regressions, not exact-value correctness. Gated
behind `RUN_ON_DEVICE_LLM_EVALS=1` plus the model file being present (via
`@Suite(.enabled(if:))`), so they're skipped — not failed — in the normal
`test-ios` CI job and in local runs without the flag set. `OnDeviceLLMEngine`
takes a `computeBackend` (`.gpu` default, `.cpu` for evals) so these can run
on hosted runners/simulators without Metal-accelerated inference.

Run locally:

```
ios/scripts/download-on-device-model.sh
RUN_ON_DEVICE_LLM_EVALS=1 xcodebuild test \
    -project FoodDiary.xcodeproj -scheme FoodDiary \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -only-testing:FoodDiaryTests/OnDeviceLLMEvalTests
```

In CI, the `eval-ios-on-device-llm` job (`ci-cd.yml`) runs the same thing on
`workflow_dispatch` only — manual trigger, not on every PR/push, since the
2.6 GB download and real inference are too slow/costly for that.

## 10. Manual test plan additions (`testing.md` §3)

Add to the pre-TestFlight checklist: enable on-device toggle on a supported
device → download model over Wi-Fi → background app mid-download and resume →
"Look Up" with on-device on → "Scan Label" with on-device on → force memory
warning (Xcode debug menu) mid-session and confirm next call reloads cleanly
→ toggle off and confirm immediate fallback to server path → delete model and
confirm storage is freed → confirm toggle is absent/disabled on a
gating-ineligible device (or simulator).

## 11. Risks / open items

- **Prompt reliability:** Gemma 4 E2B's JSON-only output isn't guaranteed;
  budget real device-testing time tuning the system prompt before declaring
  this done. This is the single biggest unknown in the plan.
- **RAM threshold is a hypothesis** (§2) — validate on real low/mid-tier
  devices (iPhone 12/13/14 class) before shipping; may need to move the
  cutoff up or down.
- **LiteRT-LM is a young, fast-moving SDK** (MediaPipe's iOS LLM API was
  deprecated in favor of it very recently) — pin a specific tag, and re-check
  the API surface (`EngineConfig`, `Content` cases) against the actual
  package once added, since docs may drift from the examples in this plan.
- **App size / review:** the app itself stays small (model is downloaded,
  not bundled), but App Store review may ask about the large first-run
  download and Hugging Face dependency — have a one-line explanation ready
  ("optional on-device AI feature, off by default, model fetched from
  Google's official Hugging Face release under Apache-2.0").
- **No checksum verification** of the downloaded model (§3) — low risk given
  HTTPS + a single official source, but revisit if Hugging Face starts
  publishing hashes.

## 12. Definition of done

- Profile has a working "Use on-device AI" toggle, hidden on ineligible
  devices, with download/delete controls and progress UI.
- With the toggle on and the model downloaded, the item form's existing
  **Look Up** and **Scan Label** buttons produce prefilled macros via Gemma 4
  E2B running fully on-device (no network calls for the inference itself).
  With the toggle off, behavior is unchanged from Phase 3 (server sidecars).
- `ItemFormViewModel`/`ItemFormView` are unmodified except for which
  `NutritionAutofillClient` they're handed.
- Model download survives backgrounding/interruption and resumes; storage is
  reclaimable via "Delete model".
- Unit tests per §9 pass in CI; manual test plan per §10 run on at least one
  real eligible device before TestFlight.
</content>
