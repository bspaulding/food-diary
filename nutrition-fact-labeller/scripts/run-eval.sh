#!/usr/bin/env bash
# Runs both eval harnesses (full-JSON and OCR-only) against a model listed in
# ../models.toml. Fetches the model first if it isn't already downloaded.
#
# Usage:
#   ./scripts/run-eval.sh <key>            # full 33-image eval, both harnesses
#   ./scripts/run-eval.sh <key> --smoke    # 2-image smoke test only (verify it runs)
#   ./scripts/run-eval.sh <key> --smoke N  # smoke test with N images instead of 2
#
# Model dir defaults to ../models/<key>/; override with MODELS_DIR env var.
# Threads default to 4; override with THREADS env var.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$CRATE_DIR/models.toml"

KEY="${1:?Usage: run-eval.sh <key> [--smoke [N]]}"
shift || true

SMOKE=0
LIMIT=2
if [ "${1:-}" = "--smoke" ]; then
    SMOKE=1
    if [ "${2:-}" != "" ] && [ "${2:-}" != "--smoke" ]; then
        LIMIT="$2"
    fi
fi

MODELS_DIR="${MODELS_DIR:-$CRATE_DIR/models}"
THREADS="${THREADS:-4}"

"$SCRIPT_DIR/fetch-model.sh" "$KEY" "$MODELS_DIR"

read -r DISPLAY_NAME MODEL_FILE MMPROJ_FILE < <(python3 - "$MANIFEST" "$KEY" <<'PYEOF'
import sys, tomllib
manifest_path, key = sys.argv[1], sys.argv[2]
with open(manifest_path, "rb") as f:
    data = tomllib.load(f)
entry = data["models"][key]
print(entry["display_name"], entry["model_file"], entry["mmproj_file"])
PYEOF
)

MODEL_PATH="$MODELS_DIR/$KEY/$MODEL_FILE"
MMPROJ_PATH="$MODELS_DIR/$KEY/$MMPROJ_FILE"

cd "$CRATE_DIR"
echo "Building vlm_benchmark and vlm_ocr_benchmark (release)..."
cargo build --release --bin vlm_benchmark --bin vlm_ocr_benchmark

LIMIT_ARGS=()
if [ "$SMOKE" = "1" ]; then
    LIMIT_ARGS=(--limit "$LIMIT")
    echo "=== SMOKE TEST ($LIMIT image(s)) — verifying $DISPLAY_NAME loads and runs ==="
else
    echo "=== FULL EVAL (33 images) — $DISPLAY_NAME ==="
fi

echo
echo "--- vlm_benchmark (full JSON extraction) ---"
./target/release/vlm_benchmark \
    --model "$MODEL_PATH" --mmproj "$MMPROJ_PATH" \
    --model-name "$DISPLAY_NAME" \
    --threads "$THREADS" \
    "${LIMIT_ARGS[@]+"${LIMIT_ARGS[@]}"}"

echo
echo "--- vlm_ocr_benchmark (OCR-only + resilient parser) ---"
./target/release/vlm_ocr_benchmark \
    --model "$MODEL_PATH" --mmproj "$MMPROJ_PATH" \
    --model-name "${DISPLAY_NAME}-ocr" \
    --threads "$THREADS" \
    "${LIMIT_ARGS[@]+"${LIMIT_ARGS[@]}"}"
