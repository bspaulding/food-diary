# nutrition-fact-labeller

A Rust/Warp HTTP service that parses nutrition label images. It supports two backends:

- **VLM** (default) — vision-language model inference. Supports two VLM backends selected at runtime via env vars:
  - **OpenRouter** (default) — calls `google/gemma-4-31b-it:free` via the [OpenRouter API](https://openrouter.ai); scored 100% all-fields / 33/33 whole-record on this project's 33-image eval (see [`eval-results/README.md`](eval-results/README.md) Known Issues #13) — the strongest result found across every candidate tested, self-hosted or hosted. No local GPU or model weights required.
  - **Local llama.cpp** — runs [Gemma 4 E2B](https://huggingface.co/google/gemma-4-E2B-it) locally via llama.cpp; requires downloading model weights. Only used as a fallback if `OPENROUTER_API_KEY`/`LLM_API_KEY` isn't set.
- **PaddleOCR** (legacy, opt-in via `backend=paddleocr`) — ONNX-based OCR pipeline, no VLM involved. **Slated for removal** — see the cleanup plan referenced in Known Issues #13; kept for now as an explicit fallback option only.

The service defaults every request to the VLM path: OpenRouter is preferred if `OPENROUTER_API_KEY`/`LLM_API_KEY` is set, otherwise it falls back to local llama.cpp if `VLM_MODEL_PATH`/`VLM_MMPROJ_PATH` are set, otherwise the request errors (PaddleOCR is no longer attempted automatically — request `backend=paddleocr` explicitly if you need it).

## Local Development

### Prerequisites

```bash
brew install rustup
rustup install stable
```

### VLM Backend Setup (optional)

#### Option A: OpenRouter (default, recommended)

Set your API key in `.env`:

```
OPENROUTER_API_KEY=sk-or-v1-...
# Optional: override the default model (google/gemma-4-31b-it:free) or routing
# OPENROUTER_MODEL=google/gemma-4-31b-it:free
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

No model weights to download. Get a free key at [openrouter.ai](https://openrouter.ai). This is
already the operational default (`DEFAULT_MODEL`/`DEFAULT_BASE_URL` in `src/vlm/openrouter.rs`) —
setting just `OPENROUTER_API_KEY` is enough, no other env vars are required.

#### Option B: Local llama.cpp

Download the model weights into `vlm-models/gemma-4-e2b/`:

```bash
pip install huggingface_hub[cli]

huggingface-cli download bartowski/google_gemma-4-E2B-it-GGUF \
  google_gemma-4-E2B-it-Q4_K_M.gguf \
  mmproj-google_gemma-4-E2B-it-f16.gguf \
  --local-dir nutrition-fact-labeller/vlm-models/gemma-4-e2b \
  --local-dir-use-symlinks False

mv nutrition-fact-labeller/vlm-models/gemma-4-e2b/mmproj-google_gemma-4-E2B-it-f16.gguf \
   nutrition-fact-labeller/vlm-models/gemma-4-e2b/mmproj-F16.gguf
```

Then set the env vars in `.env` (`.env.example` already has the right paths):

```
VLM_MODEL_PATH=nutrition-fact-labeller/vlm-models/gemma-4-e2b/gemma-4-E2B-it-Q4_K_M.gguf
VLM_MMPROJ_PATH=nutrition-fact-labeller/vlm-models/gemma-4-e2b/mmproj-F16.gguf
```

If no VLM env vars are set, the service starts in OCR-only mode.

### VLM Benchmarks

Two harnesses run local llama.cpp VLM backends against `test_cases.csv` / `images/` and compare
against the PaddleOCR baseline. Past results are tracked in the living summary at
[`eval-results/README.md`](eval-results/README.md) — check it before re-running an eval someone
else already ran, and add to it after any new run.

The easiest way to run either harness is via [`models.toml`](models.toml) — a manifest of every
model this project tracks (HF repo, filenames, confirmed llama.cpp support, notes) — and the
scripts that key off it:

```bash
./scripts/fetch-model.sh <key>            # download a model listed in models.toml
./scripts/run-eval.sh <key> --smoke       # quick 2-image smoke test (does it load and run?)
./scripts/run-eval.sh <key>               # full 33-image eval, both harnesses
```

To add a new model, add a `[models.<key>]` entry to `models.toml` and run the two commands above.

Both binaries can also be run directly with explicit paths, if you're not using the manifest:

`src/bin/vlm_benchmark.rs` — the VLM does the full image → structured JSON extraction itself:

```bash
cargo run --release --bin vlm_benchmark -- \
  --model /path/to/model.gguf \
  --mmproj /path/to/mmproj.gguf \
  --model-name "my-model" \
  --threads 4 \
  --limit 2  # optional: cap the number of images for a quick smoke test
```

`src/bin/vlm_ocr_benchmark.rs` — the VLM is used purely as an OCR engine (image → transcribed
text), and its output is fed through the same regex/spellcheck parser the PaddleOCR backend uses:

```bash
cargo run --release --bin vlm_ocr_benchmark -- \
  --model /path/to/model.gguf \
  --mmproj /path/to/mmproj.gguf \
  --model-name "my-model-ocr" \
  --threads 4 \
  --limit 2  # optional
```

### Run

```bash
cargo run
```

The service listens on port 3030 by default (override with `PORT`).

## API

### `POST /label`

Accepts a multipart form upload with an `image` field. Returns extracted nutrition data as JSON.

## Container Image

Published to `ghcr.io/bspaulding/food-diary/nutrition-fact-labeller`. The PaddleOCR model weights are baked into the image; VLM weights must be mounted at runtime via `VLM_MODEL_PATH` / `VLM_MMPROJ_PATH`.

For Kubernetes deployment, see the food-diary k8s GitOps repo — an init container downloads the VLM weights from `bartowski/google_gemma-4-E2B-it-GGUF` on first run and caches them on a PVC.
