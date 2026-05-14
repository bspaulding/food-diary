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
  --local-dir /path/to/models \
  --local-dir-use-symlinks False
```

Then set `GEMMA_MODEL_PATH` in `.env` to the downloaded file path. This env var is required — the service will not start without it.

If you also run `nutrition-fact-labeller` locally, both services can share the same GGUF file — just point `GEMMA_MODEL_PATH` and `VLM_MODEL_PATH` at the same path.

### Run

```bash
cargo run
```

The service listens on port 3031 by default (override with `PORT`).

## API

### `POST /lookup`

Accepts a JSON body with a `description` field. Returns estimated nutrition data as JSON.

## Model Selection

Q5_K_M is recommended for production. Q4_K_M is ~17% faster but meaningfully less accurate on calories and protein.

Eval results across 27 cases (2026-05-13):

| Macro | Q5_K_M MAE | Q4_K_M MAE |
|---|---|---|
| Calories | **11.9** | 17.2 |
| Fat (g) | **0.9** | 1.2 |
| Protein (g) | **0.8** | 2.0 |
| Carbs (g) | 2.6 | 2.7 |

| | Q5_K_M | Q4_K_M |
|---|---|---|
| Avg latency | 11.7s | 9.7s |

Q4 shows a recurring pattern of hallucinating `166` kcal for unrelated items (avocado half, CLIF Bar, raw egg), suggesting it occasionally loses context between the query and the response format. Full results in `eval/results/`.

## Container Image

Published to `ghcr.io/bspaulding/food-diary/llm-nutrition-api`. The model weights must be provided at runtime via `GEMMA_MODEL_PATH` — they are not baked into the image.
