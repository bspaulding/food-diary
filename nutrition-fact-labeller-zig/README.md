# nutrition-fact-labeller-zig

A Zig port of [`nutrition-fact-labeller`](../nutrition-fact-labeller), the HTTP service that parses
nutrition label images using vision-language model (VLM) inference. It exposes the same `POST
/label` API, authenticated the same way (an Auth0 RS256 ID token), and calls the same OpenRouter
backend (`google/gemma-4-31b-it:free` by default) that the Rust original documents as its
strongest-scoring, operationally-default backend.

Built against Zig **0.16.0**, using its `std.Io`-interface-based `std.http.Server`/`std.http.Client`
and the `pub fn main(init: std.process.Init) !void` ("Juicy Main") entry point convention. Rather
than threading the `std.Io` value through every function as its own parameter, it's bundled with
its allocator into a small `Env` struct (`src/env.zig`) that gets passed around instead — e.g.
`auth.validateJwt(env, token, secret, audience)` — since the two are almost always needed together.

## What's ported vs. not

Ported, matching the Rust original's behavior:

- `POST /label`: multipart image upload → OpenRouter/OpenAI-compatible chat-completions VLM call →
  JSON nutrition facts response.
- Auth0 RS256 JWT verification (`src/auth.zig`), including the `aud` array-or-string check and the
  `HASURA_GRAPHQL_JWT_SECRET` / `AUTH0_AUDIENCE` env vars.
- The OpenRouter/API backend (`src/vlm/openrouter.zig`): same prompt, same 429 retry/backoff
  behavior (`Retry-After` header, then a Gemini-style `error.details[].retryDelay` body field, then
  exponential backoff), same env vars (`LLM_API_KEY`/`OPENROUTER_API_KEY`,
  `LLM_MODEL`/`OPENROUTER_MODEL`, `LLM_BASE_URL`/`OPENROUTER_BASE_URL`).
  - `zig build bench` — an OpenRouter/API benchmark CLI equivalent to
  `vlm_benchmark_api.rs`, scoring against `test_cases.csv`/`images/`.
- `ParsedNutritionFacts`, field-level scoring (`FieldScore`), and the CSV test-case loader
  (`src/root.zig`).

**Not ported: the local llama.cpp (Gemma 4 E2B) fallback backend.** The Rust original's
`src/vlm/llava.rs` binds to llama.cpp/mtmd's C++ API via the `llama-cpp-2` crate (batch
prefill/decode, greedy sampling, chat templating). Reimplementing that in Zig would mean
hand-writing C bindings to llama.cpp and a token sampling loop with no way to build or verify it
against real GGUF models in the environment this port was written in — too much untested surface
for a faithful port. The Rust project's own README calls the OpenRouter backend "the strongest
result found across every candidate tested, self-hosted or hosted" and the operational default, so
that's the backend this port implements; if neither `LLM_API_KEY` nor `OPENROUTER_API_KEY` is set,
`/label` requests fail the same way the original does when no backend is configured.

Other intentional divergences:

- **One request per connection.** The Rust original runs on warp/hyper with HTTP keep-alive; this
  port handles one request per accepted TCP connection, then closes it (`Connection: close`).
  Simpler connection lifecycle, fine for an internal, low-concurrency service — but don't expect
  persistent connections from a load-testing tool.
- **JSON float formatting.** Zig's `std.json.Stringify` renders a whole-number float like `8.0` as
  `8` rather than `8.0`. Both are valid JSON numbers and parse identically everywhere; it's a
  cosmetic difference from `serde_json`'s output, not a correctness one.
- No graceful-shutdown log line on Ctrl-C (the process just exits); functionally equivalent for how
  this runs in a container.

## Build & test

```bash
zig build            # builds bin/nutrition-fact-labeller and bin/vlm_benchmark_api
zig build test        # runs all unit tests, including:
                       #  - a full JWT verification round-trip against a real self-signed
                       #    RSA-2048 cert (src/auth.zig), and
                       #  - a real HTTP round-trip against a mock OpenAI-compatible server
                       #    (src/vlm/openrouter.zig)
```

## Run

```bash
# OpenRouter backend (recommended, no local model weights needed):
export OPENROUTER_API_KEY=sk-or-v1-...
# Auth (matches the Rust original's Hasura/Auth0 setup):
export HASURA_GRAPHQL_JWT_SECRET='{"key": "-----BEGIN CERTIFICATE-----..."}'
# export AUTH0_AUDIENCE=...   # optional, defaults to the same DEFAULT_AUDIENCE as the Rust original

zig build run
# or: PORT=3030 ./zig-out/bin/nutrition-fact-labeller
```

The service listens on port 3030 by default (override with `PORT`). Log verbosity defaults to
`info` and can be overridden at runtime with `LOG_LEVEL` (`debug`, `info`, `warn`/`warning`, or
`error`/`err`, case-insensitive) — this is a runtime check in a custom `logFn`, not just
`std_options.log_level`, since Zig's built-in level filtering happens at compile time and can't
otherwise be changed per run.

### `POST /label`

Accepts a multipart form upload with an `image` field, `Authorization: Bearer <Auth0 ID token>`.
Returns extracted nutrition data as JSON: `{"image": {"calories": 110, ...}}`.

## Benchmark

`zig build bench -- --model <model> [--model-name <name>] [--csv <path>] [--images-dir <dir>]
[--limit <n>]` runs the OpenRouter/API backend against the shared test suite. Requires
`LLM_API_KEY`/`OPENROUTER_API_KEY` in the environment.

`test_cases.csv` is copied into this directory (it's tiny), but the 33 test images are **not**
duplicated here — they already live in [`../nutrition-fact-labeller/images`](../nutrition-fact-labeller/images)
(~230MB). Point `--images-dir` there:

```bash
zig build bench -- --model google/gemma-4-31b-it:free \
  --images-dir ../nutrition-fact-labeller/images
```
