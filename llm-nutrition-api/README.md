# llm-nutrition-api

A Rust/Warp HTTP service that estimates nutrition information from food descriptions using [Gemma 4 E2B](https://huggingface.co/google/gemma-4-E2B-it) via llama.cpp.

## Local Development

### Prerequisites

```bash
brew install rustup cmake
rustup install stable
```

### Model Setup

Download the model weight (3.4 GB) from Hugging Face:

```bash
pip install huggingface_hub[cli]

huggingface-cli download bartowski/google_gemma-4-E2B-it-GGUF \
  google_gemma-4-E2B-it-Q5_K_M.gguf \
  --local-dir llm-nutrition-api \
  --local-dir-use-symlinks False
```

Then set `GEMMA_MODEL_PATH` in `.env`:

```
GEMMA_MODEL_PATH=llm-nutrition-api/google_gemma-4-E2B-it-Q5_K_M.gguf
```

This env var is required — the service will not start without it.

### Run

```bash
cargo run
```

The service listens on port 3031 by default (override with `PORT`).

## API

### `POST /lookup`

Accepts a JSON body with a `description` field. Returns estimated nutrition data as JSON.

## Container Image

Published to `ghcr.io/bspaulding/food-diary/llm-nutrition-api`. The model weights must be provided at runtime via `GEMMA_MODEL_PATH` — they are not baked into the image.
