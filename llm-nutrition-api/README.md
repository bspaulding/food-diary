# llm-nutrition-api

An HTTP service with two endpoints that both proxy to hosted LLM providers (never local
inference):

- `POST /upload` — parses a nutrition label image via vision-language model (VLM) inference.
  Ported from `nutrition-fact-labeller`, the original Rust/Warp OCR service.
- `POST /lookup` — looks up or estimates nutrition info for a plain-text food description, using a
  small multi-round tool-calling agent (web search + webpage reading). Ported from the original
  Rust/Warp `llm-nutrition-api` service.

The two services were merged into one project (this one) once both dropped local model inference
in favor of always proxying to a hosted provider (OpenRouter, Gemini, etc.) — at that point they
were "the same shape of project, two endpoints, two prompts," and merging them simplifies the
deployment pipeline down to a single component.

Built against Zig **0.16.0**, using its `std.Io`-interface-based `std.http.Server`/`std.http.Client`
and the `pub fn main(init: std.process.Init) !void` ("Juicy Main") entry point convention. Rather
than threading the `std.Io` value through every function as its own parameter, it's bundled with
its allocator into a small `Env` struct (`src/env.zig`) that gets passed around instead — e.g.
`auth.validateJwt(env, token, secret, audience)` — since the two are almost always needed together.

## Layout

```
src/
  main.zig            HTTP server: routes POST /upload and POST /lookup
  auth.zig            Auth0 RS256 JWT verification (shared by both routes)
  root.zig            ParsedNutritionFacts (image schema) + NutritionItem (lookup schema)
  vlm.zig             Image-labelling prompt + extractJson helper
  openrouter.zig       OpenRouter/OpenAI-compatible VLM backend for /upload
  vlm_benchmark_api.zig  Image-labelling eval CLI (`zig build bench`)
  llm/
    http.zig          Shared OpenAI-compatible chat-completions POST + 429 retry logic
    agent.zig         /lookup's multi-round tool-calling agent + system prompt
    tools.zig         search_web / read_webpage tools for the agent
eval/
  dataset.json        Ground-truth cases for /lookup
  run_evals.py        Eval harness for /lookup (see "Evals" below)
  results/            Historical eval run output
images/               Test images for the /upload benchmark (~230MB, not the eval/ dataset)
test_cases.csv        Ground-truth for the /upload benchmark
```

## What's ported vs. not

Ported, matching each Rust original's behavior:

- `POST /upload` (`nutrition-fact-labeller`'s `/label`, renamed to match the production ingress
  path): multipart image upload → OpenRouter/OpenAI-compatible chat-completions VLM call → JSON
  nutrition facts response. The Rust original's route had no path filter at all (any path
  accepted); this port explicitly matches `/upload`, the path the ingress/dev-proxy actually
  forwards after stripping its `/labeller` prefix.
- `POST /lookup` (`llm-nutrition-api`'s route, same name): JSON `{"description": "..."}` body → a
  multi-round tool-calling agent (max 5 rounds) → JSON `{"item": {...}}` nutrition estimate.
  Ported verbatim: the system prompt, the `search_web`/`read_webpage` tool-call JSON protocol, the
  final-round "answer now" nudge, and the 429 retry/backoff behavior.
- Auth0 RS256 JWT verification (`src/auth.zig`), including the `aud` array-or-string check and the
  `HASURA_GRAPHQL_JWT_SECRET` / `AUTH0_AUDIENCE` env vars — identical between both original
  services, so this needed no changes to merge.
- `ParsedNutritionFacts` (image schema) and `NutritionItem` (lookup schema) are kept as two
  **distinct** types (`src/root.zig`) with their original field names/units, since both web and iOS
  clients hardcode them exactly — merging the projects does not mean merging the schemas.

**Not ported: local llama.cpp inference**, for either endpoint. Both Rust originals could fall back
to a local Gemma model via the `llama-cpp-2` crate; per this project's direction, local inference
is dropped entirely going forward — only hosted-provider proxying remains. Requests fail loudly if
no `LLM_API_KEY`/`OPENROUTER_API_KEY` is configured.

**`search_web`/`read_webpage` are simplified/hand-rolled, not faithful ports.** The Rust
`llm-nutrition-api`'s tools used the `websearch` crate (DuckDuckGo provider) and `dom_smoothie`
(Mozilla-Readability-style article extraction) — neither has a Zig equivalent. This port instead:
scrapes DuckDuckGo's no-JS `html.duckduckgo.com/html/` endpoint with substring/tag scanning (no
real HTML parser), and strips all HTML tags down to plain text for `read_webpage` rather than
identifying "main article content." See "Known risks" below for a real limitation found while
validating this approach.

Other intentional divergences:

- **One request per connection.** Both Rust originals ran on warp/hyper with HTTP keep-alive; this
  port handles one request per accepted TCP connection, then closes it (`Connection: close`).
  Simpler connection lifecycle, fine for an internal, low-concurrency service.
- **Shared model config across both endpoints.** Each Rust original independently defaulted to a
  different provider (`/upload`: Gemma-4-31B via OpenRouter; `/lookup`: Gemini-2.0-flash via Google
  directly). This port defaults **both** endpoints to the same OpenRouter/Gemma-4-31B backend, and
  an explicit `LLM_MODEL`/`LLM_BASE_URL` override now applies to both endpoints at once rather than
  being independently tunable per service. A deliberate simplification of the merge, not an
  oversight.
- **JSON float formatting.** Zig's `std.json.Stringify` renders a whole-number float like `8.0` as
  `8` rather than `8.0`. Both are valid JSON numbers and parse identically everywhere.
- No graceful-shutdown log line on Ctrl-C (the process just exits); functionally equivalent for how
  this runs in a container.

## Build & test

```bash
zig build            # builds bin/llm-nutrition-api and bin/vlm_benchmark_api
zig build test       # runs all unit tests, including:
                      #  - a full JWT verification round-trip against a real self-signed
                      #    RSA-2048 cert (src/auth.zig)
                      #  - a real HTTP round-trip against a mock OpenAI-compatible server
                      #    (src/openrouter.zig, src/llm/agent.zig)
                      #  - search_web/read_webpage HTML-scraping unit tests against both
                      #    synthetic and real captured markup, no network calls at test time
                      #    (src/llm/tools.zig, src/llm/testdata/)
```

## Run

```bash
# Hosted API backend (recommended; the only backend this service supports):
export LLM_API_KEY=...          # or OPENROUTER_API_KEY
# export LLM_MODEL=...          # optional, overrides BOTH endpoints' default model
# export LLM_BASE_URL=...       # optional, overrides BOTH endpoints' default base URL

# Auth (matches both Rust originals' Hasura/Auth0 setup):
export HASURA_GRAPHQL_JWT_SECRET='{"key": "-----BEGIN CERTIFICATE-----..."}'
# export AUTH0_AUDIENCE=...     # optional, defaults to the same DEFAULT_AUDIENCE as the originals

zig build run
# or: PORT=3030 ./zig-out/bin/llm-nutrition-api
```

The service listens on port 3030 by default (override with `PORT`). Log verbosity defaults to
`info` and can be overridden at runtime with `LOG_LEVEL` (`debug`, `info`, `warn`/`warning`, or
`error`/`err`, case-insensitive) — this is a runtime check in a custom `logFn`, not just
`std_options.log_level`, since Zig's built-in level filtering happens at compile time and can't
otherwise be changed per run.

### `POST /upload`

Accepts a multipart form upload with an `image` field, `Authorization: Bearer <Auth0 ID token>`.
Returns extracted nutrition data as JSON: `{"image": {"calories": 110, ...}}`.

### `POST /lookup`

Accepts `{"description": "1 cup cooked oatmeal"}`, `Authorization: Bearer <Auth0 ID token>`.
Returns `{"item": {"description": "...", "calories": 166, ...}}` (14 fields; see
`root.NutritionItem`).

## Benchmarks

Two independent benchmarks, one per endpoint, both kept from their respective original projects:

### `/upload` benchmark

`zig build bench -- --model <model> [--model-name <name>] [--csv <path>] [--images-dir <dir>]
[--limit <n>]` runs the OpenRouter/API backend against the shared test suite. Requires
`LLM_API_KEY`/`OPENROUTER_API_KEY` in the environment.

```bash
zig build bench -- --model google/gemma-4-31b-it:free --images-dir images
```

### `/lookup` evals

`eval/run_evals.py` is a Python harness (kept from the original `llm-nutrition-api`) that scores
`/lookup` against `eval/dataset.json`'s ground-truth cases (calorie/macro accuracy, tolerance
bands). `/lookup` requires a valid Auth0 RS256 Bearer token, so pass one via `--token` or
`LLM_NUTRITION_API_EVAL_TOKEN`. Start the service, then:

```bash
python3 eval/run_evals.py --token <jwt> --output eval/results/
```

**Run end-to-end against the real merged implementation** (OpenRouter/Gemma-4-31B, both endpoints'
shared default) — see `eval/results/2026-07-23.md`: 27/27 cases succeeded, 100% of calorie/fat/carb
predictions within tolerance, 93% of protein predictions within tolerance. This run caught a real
bug (fixed): the HTTP client wasn't decompressing gzip-encoded response bodies, so every real
provider response failed to parse — mock-server tests never exercised this since they don't
compress responses. `src/llm/tools.zig`'s HTML-scraping logic was additionally validated against
real captured HTML (not just hand-written fixtures) via `zig build test`'s fixture-based
regression tests (`src/llm/testdata/`).

## Known risks

**DuckDuckGo's `html.duckduckgo.com/html/` endpoint can serve an anti-bot CAPTCHA challenge page
instead of real results.** Observed directly during development: an isolated query (outside the
full agent loop) got back a "Select all squares containing a duck"-style challenge page instead of
search results — `src/llm/testdata/ddg_bot_challenge_response.html` is that actual captured
response. In the full 27-case eval run above, `search_web` did return usable results for both
branded-item cases (CLIF Bar, Quest Bar), so this isn't a hard block, but it's evidently
inconsistent — this may depend on the calling IP's reputation (shared/datacenter IPs are common
CAPTCHA targets, and a cloud k8s cluster's egress IP is a similarly plausible target) or on
DuckDuckGo's bot-detection heuristics more generally. `search_web` degrades gracefully either way
(`parseSearchResults` returns zero results rather than crashing, and the agent loop treats an
empty/failed search as "estimate from nutritional knowledge instead" — see `llm/agent.zig`'s
`runSearchWeb`), so branded-item lookups fall back to the model's own knowledge instead of
hard-failing. If this becomes a persistent problem in production, the fix is a different search
backend/provider, not a bigger parser.
