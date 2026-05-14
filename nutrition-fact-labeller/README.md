# nutrition-fact-labeller

A Rust/Warp HTTP service that parses nutrition label images. It supports two backends:

- **PaddleOCR** (default) — ONNX-based OCR pipeline; no extra setup required
- **VLM** (optional) — [Gemma 4 E2B](https://huggingface.co/google/gemma-4-E2B-it) via llama.cpp; more accurate but requires downloading model weights

## Local Development

### Prerequisites

```bash
brew install rustup
rustup install stable
```

### VLM Model Setup (optional)

If you want VLM inference locally, download the model weights into `vlm-models/gemma-4-e2b/`:

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

If neither env var is set, the service starts in OCR-only mode.

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
