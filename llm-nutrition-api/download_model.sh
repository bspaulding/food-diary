#!/usr/bin/env bash
set -euo pipefail

# Downloads the Gemma 4 E2B IT Q5_K_M GGUF from the bartowski HuggingFace repo.
# The model is public; HF_TOKEN is optional but avoids rate limiting.
#
# Usage:
#   ./download_model.sh                          # saves next to this script
#   ./download_model.sh /path/to/models/dir/
#   HF_TOKEN=hf_... ./download_model.sh          # authenticated download
#   GEMMA_MODEL_PATH=/custom/path.gguf ./download_model.sh

REPO="bartowski/google_gemma-4-E2B-it-GGUF"
FILENAME="google_gemma-4-E2B-it-Q5_K_M.gguf"
URL="https://huggingface.co/${REPO}/resolve/main/${FILENAME}"

# Determine destination: explicit arg > GEMMA_MODEL_PATH > alongside this script
if [[ $# -ge 1 ]]; then
    DEST="$1"
    # If a directory was given, append the filename
    if [[ -d "$DEST" || "$DEST" == */ ]]; then
        DEST="${DEST%/}/${FILENAME}"
    fi
elif [[ -n "${GEMMA_MODEL_PATH:-}" ]]; then
    DEST="${GEMMA_MODEL_PATH}"
else
    DEST="$(dirname "$0")/${FILENAME}"
fi

echo "Model : ${FILENAME}"
echo "Source: ${URL}"
echo "Dest  : ${DEST}"

if [[ -f "$DEST" ]]; then
    echo "Already exists: ${DEST} ($(du -sh "$DEST" | cut -f1)). Delete it to re-download."
    exit 0
fi

mkdir -p "$(dirname "$DEST")"

CURL_ARGS=(-L --progress-bar --output "${DEST}")
if [[ -n "${HF_TOKEN:-}" ]]; then
    CURL_ARGS+=(-H "Authorization: Bearer ${HF_TOKEN}")
    echo "Auth  : using HF_TOKEN"
fi

curl "${CURL_ARGS[@]}" "${URL}"

echo ""
echo "Downloaded: $(du -sh "$DEST" | cut -f1)"
echo ""
echo "Set in your environment:"
echo "  export GEMMA_MODEL_PATH=${DEST}"
