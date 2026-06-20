# CI — GitHub Actions for iOS

**PRD coverage:** §12 (CI), decision #14. Matches the repo's existing
`.github/workflows/ci-cd.yml` conventions (paths-filter + per-package jobs).

**Goal:** build the app and run the unit-test bundle on PRs that touch `ios/`,
using `xcodebuild` on a macOS runner with an iOS 18 simulator.

---

## 1. Integrate with the existing workflow

The repo uses a single `ci-cd.yml` with a `changes` job (`dorny/paths-filter`)
gating per-package jobs (`test-web`, etc.). Two options:

- **Preferred:** add an `ios` filter to the existing `changes` job and a new
  `test-ios` job gated on it. Keeps one workflow, matches the established pattern.
- **Alternative:** a standalone `.github/workflows/ios.yml` with its own
  `paths: ["ios/**"]` trigger. Simpler isolation; pick this if the macOS runner
  cost/queueing should be fully decoupled.

This plan specifies the **preferred** integration.

### 1.1 Add the filter (in the `changes` job)
```yaml
outputs:
  ios: ${{ steps.filter.outputs.ios }}
# ...
filters: |
  ios:
    - "ios/**"
```

### 1.2 Add the job
```yaml
test-ios:
  needs: changes
  if: |
    (github.event_name == 'pull_request' || github.ref == 'refs/heads/main') &&
    needs.changes.outputs.ios == 'true'
  runs-on: macos-15        # provides Xcode 16 / iOS 18 SDK
  defaults:
    run:
      working-directory: ios
  env:
    TZ: America/Los_Angeles   # date-sensitive tests (matches web)
  steps:
    - uses: actions/checkout@v4
    - name: Select Xcode 16
      run: sudo xcode-select -s /Applications/Xcode_16.app
    - name: Show available simulators
      run: xcrun simctl list devices available
    - name: Build & test
      run: |
        xcodebuild test \
          -project FoodDiary.xcodeproj \
          -scheme FoodDiary \
          -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.0' \
          -resultBundlePath TestResults.xcresult \
          CODE_SIGNING_ALLOWED=NO | xcbeautify
    - name: Upload results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: ios-test-results
        path: ios/TestResults.xcresult
```

Notes:
- `CODE_SIGNING_ALLOWED=NO` — CI builds for the simulator, no provisioning needed.
- Pin a concrete simulator name/OS available on the runner image; adjust if the
  hosted image's default device differs (the "Show available simulators" step
  helps diagnose).
- `xcbeautify` is optional log formatting; drop it if avoiding the install.
- The Auth0 config values needed at runtime are **not** needed to build/test —
  unit tests don't perform real network auth (they use fakes, `testing.md`).

---

## 2. What CI guards

- Compiles the app target (catches concurrency/`Sendable` violations from §6.3).
- Runs the mandatory unit tests (`testing.md` §1): calculations, decoding, error
  mapping, auth crypto + refresh coalescing.

## 3. Definition of Done

- A PR touching `ios/` triggers `test-ios`; PRs not touching `ios/` skip it.
- Job builds and runs the test bundle green on the macOS runner with
  `TZ=America/Los_Angeles`.
</content>
