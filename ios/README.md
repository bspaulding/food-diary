# Food Diary — iOS

Native iOS client for the Food Diary backend (Swift + SwiftUI, MVVM +
`@Observable`, zero third-party dependencies). See the PRD
(`../specs/2026-06-20-ios-app.md`) and the implementation plans in
[`plans/`](plans/) for full context; [`plans/STATUS.md`](plans/STATUS.md)
tracks what's done.

## Status: Phase 0 — Foundation

This phase delivers a buildable, testable Xcode project with a login gate:

- `FoodDiary.xcodeproj` — plain Xcode project (no SPM deps for v1).
- `FoodDiary/` — app target: `App/`, `Auth/`, `Networking/`, `Models/`,
  `Repositories/` (protocols only; concrete implementations land in Phase 1).
- `FoodDiaryTests/` — Swift Testing unit tests covering PKCE (RFC 7636
  vectors), authorize-URL construction, JWT `exp` decoding, refresh
  coalescing, `APIError` mapping, and model decoding.
- `Config/*.xcconfig` — Auth0 domain/client id/scheme (no secrets — a Native
  OAuth client has none). Replace the placeholder values per
  [`plans/auth0-testflight-setup.md`](plans/auth0-testflight-setup.md) before
  first run.

Feature screens (diary list, entries, items, recipes, targets, profile) ship
in Phase 1 — see [`plans/phase-1-core-logging.md`](plans/phase-1-core-logging.md).

## Building

Requires Xcode 16+ (iOS 18 SDK). Open `FoodDiary.xcodeproj` and run the
`FoodDiary` scheme, or from the command line:

```sh
cd ios
xcodebuild test \
  -project FoodDiary.xcodeproj \
  -scheme FoodDiary \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.0'
```

Before login works against the live tenant, complete the manual Auth0 setup
in [`plans/auth0-testflight-setup.md`](plans/auth0-testflight-setup.md) and
fill in `Config/Shared.xcconfig`.
