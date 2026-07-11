# nutrition-fact-labeller

A Rust/Warp HTTP service that parses nutrition label images. It supports two backends:

- **PaddleOCR** (default) — ONNX-based OCR pipeline; no extra setup required
- **VLM** (optional) — vision-language model inference; more accurate. Supports two VLM backends selected at runtime via env vars:
  - **OpenRouter** — calls `google/gemma-4-31b-it:free` (or any vision model) via the [OpenRouter API](https://openrouter.ai); easiest to set up, no local GPU required
  - **Local llama.cpp** — runs [Gemma 4 E2B](https://huggingface.co/google/gemma-4-E2B-it) locally via llama.cpp; requires downloading model weights

When `backend=vlm` is requested, OpenRouter is preferred if `OPENROUTER_API_KEY` is set; otherwise the service falls back to local llama.cpp if `VLM_MODEL_PATH`/`VLM_MMPROJ_PATH` are set. If neither is configured the request returns an error.

## Local Development

### Prerequisites

```bash
brew install rustup
rustup install stable
```

### VLM Backend Setup (optional)

#### Option A: OpenRouter (recommended)

Set your API key in `.env`:

```
OPENROUTER_API_KEY=sk-or-v1-...
# Optional: override the default model (google/gemma-4-31b-it:free)
# OPENROUTER_MODEL=google/gemma-4-31b-it:free
```

No model weights to download. Get a free key at [openrouter.ai](https://openrouter.ai).

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
against the PaddleOCR baseline. Past results are recorded in [`eval-results/`](eval-results/).

`src/bin/vlm_benchmark.rs` — the VLM does the full image → structured JSON extraction itself:

```bash
cargo run --release --bin vlm_benchmark -- \
  --model /path/to/model.gguf \
  --mmproj /path/to/mmproj.gguf \
  --model-name "my-model" \
  --threads 4
```

`src/bin/vlm_ocr_benchmark.rs` — the VLM is used purely as an OCR engine (image → transcribed
text), and its output is fed through the same regex/spellcheck parser the PaddleOCR backend uses:

```bash
cargo run --release --bin vlm_ocr_benchmark -- \
  --model /path/to/model.gguf \
  --mmproj /path/to/mmproj.gguf \
  --model-name "my-model-ocr" \
  --threads 4
```

Past results are recorded in [`eval-results/`](eval-results/).

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
