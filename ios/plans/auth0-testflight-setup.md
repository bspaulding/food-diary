# Auth0 Tenant + TestFlight — Manual Setup Runbook

**PRD coverage:** §10, §16 (Auth0 tenant config), §17 (reminder checklist), §14
(the top risk: callback URL not yet configured), §15 (DoD includes this).

> ⚠️ **None of this is created by building the Xcode project.** It is out-of-band
> setup done by hand in the Auth0 dashboard, Hasura, and App Store Connect. Login
> will not work and TestFlight cannot ship until it's complete. Schedule it as the
> final gate before first run.

This runbook is the actionable expansion of PRD §16/§17. Work top to bottom.

---

## A. Auth0 — Native application (§16.1)

The iOS app reuses the **existing tenant** that backs the web app but needs its
**own Native application** (the web app is a SPA; Native is a separate secret-less
public client using PKCE).

1. Auth0 Dashboard → **Applications → Applications → Create Application**.
2. Name `Food Diary iOS`, Type **Native**, Create.
3. From **Settings**, copy **Domain** and **Client ID** → these become
   `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` in `ios/Config/Shared.xcconfig`. A Native
   app has **no client secret** (correct — public client).

## B. Callback / logout URLs (§16.2)

Custom scheme tied to the bundle id `com.motingo.fooddiary`. Callback URL
format: `{SCHEME}://{AUTH0_DOMAIN}/ios/{BUNDLE_ID}/callback`.

In the Native app's **Settings**:
- **Allowed Callback URLs:**
  `com.motingo.fooddiary://<AUTH0_DOMAIN>/ios/com.motingo.fooddiary/callback`
- **Allowed Logout URLs:** the same value (used by `/v2/logout` return).
- Save.

> The redirect URI contains `://`, so it is **assembled in Swift**, not in
> xcconfig (PRD §16.5). The Swift value must match this Auth0 entry **exactly**.

## C. Refresh tokens with rotation (§16.3)

In the Native app's settings:
- **Refresh Token Rotation:** enable **Rotation**.
- **Refresh Token Expiration:** enable **Absolute** (optionally **Inactivity**).
- **Settings → Advanced → Grant Types:** ensure **Authorization Code** and
  **Refresh Token** are checked.
- The app requests `offline_access` in code (§6.5) so a refresh token is issued.

## D. API (audience) authorizes the Native app (§16.4)

The access token must be a **JWT for the Hasura API**
(`https://direct-satyr-14.hasura.app/v1/graphql`):
- Auth0 → **Applications → APIs → [Hasura API] → Settings:** ensure **Allow
  Offline Access** is enabled.
- No per-app authorization toggle is needed for Native against a standard API,
  but verify the audience identifier **exactly** matches the constant the app
  sends (`OIDCClient.audience`).

## E. App config lands the values (§16.5)

`ios/Config/Shared.xcconfig` (only values **without** `://`):
```
AUTH0_DOMAIN    = <tenant>.us.auth0.com
AUTH0_CLIENT_ID = <native app client id>
AUTH0_SCHEME    = com.motingo.fooddiary
```
In Swift (constants, because they contain `://`):
- audience: `"https://direct-satyr-14.hasura.app/v1/graphql"`
- redirect: `"\(scheme)://\(domain)/ios/\(bundleId)/callback"`

Register the scheme in `Info.plist` → `CFBundleURLTypes` so the OS routes the
callback back to the app.

## F. Backend — apply the targets migration (§9)

See [`backend-nutrition-targets.md`](backend-nutrition-targets.md). Then:
```bash
cd graphql-engine
hasura migrate apply
hasura metadata apply
```

## G. Verify the login round-trip (§16.6)

- Run the app, tap **Log In** → Auth0 universal-login appears in the in-app
  browser sheet → returns to the app after login.
- Decode the returned `access_token` (jwt.io or a debug log of claims) and confirm
  it contains `https://hasura.io/jwt/claims` with `x-hasura-user-id`. **If the
  token is opaque (not a JWT), the `audience` param is missing/wrong** (§6.5).
- Confirm a GraphQL query returns the signed-in user's data.

## H. TestFlight (§17 last item)

- App Store Connect: create the app record (bundle id
  `com.motingo.fooddiary`).
- Signing/provisioning: distribution cert + App Store provisioning profile (or
  Xcode automatic signing with the team).
- Archive a **Release** build (production ingress) and upload the first build to
  TestFlight; add yourself as an internal tester.

---

## §17 Checklist (mirrors the PRD — tick before first run / TestFlight)

- [ ] Auth0: create the **Native** application in the existing tenant (A).
- [ ] Auth0: set Allowed **Callback** and **Logout** URLs to the custom scheme (B).
- [ ] Auth0: enable **Refresh Token Rotation** + Authorization Code & Refresh
      Token grants (C).
- [ ] Auth0: confirm the Hasura **API audience** allows offline access and the
      identifier matches (D).
- [ ] App config: Domain / Client ID / Scheme in `.xcconfig`; audience + redirect
      in Swift; `CFBundleURLTypes` registered in `Info.plist` (E).
- [ ] Verify: login round-trip returns a Hasura-claims JWT (G).
- [ ] Backend: apply the `nutrition_target` migration + metadata (F / §9).
- [ ] TestFlight: App Store Connect record, signing/provisioning, first upload (H).

---

## Common failure modes (from PRD §6.5 / §14)

| Symptom | Likely cause | Fix |
|---|---|---|
| Token is opaque, Hasura rejects it | `audience` param missing/wrong | Send exact audience constant (§6.5 #1, D) |
| No refresh token returned | `offline_access` not requested or API offline-access off | Add scope (§6.5 #2) + enable on API (C/D) |
| Surprise logouts after a while | Rotated refresh token not persisted | Persist new refresh token on every refresh (§6.5 #3) |
| Random logouts under load | Concurrent refresh race | `TokenStore` actor coalescing (§6.5 #4) |
| Tokens lost / Keychain errors at launch | Wrong accessibility class | `kSecAttrAccessibleAfterFirstUnlock` (§6.5 #5) |
| Callback never returns to app | Scheme/redirect mismatch | Auth0 callback === Swift redirect === `Info.plist` scheme (B/E) |
</content>
