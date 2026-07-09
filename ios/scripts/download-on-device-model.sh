#!/usr/bin/env bash
# Downloads the Gemma 4 E2B LiteRT-LM model file used by OnDeviceLLMEngine,
# for local development or CI eval runs (see OnDeviceLLMEvalTests.swift and
# ios/plans/phase-6-on-device-llm.md §9). Idempotent: skips if the file
# already exists.
#
# Usage:
#   ios/scripts/download-on-device-model.sh [destination-path]
#
# Destination defaults to $ON_DEVICE_LLM_MODEL_PATH, then
# ios/.cache/on-device-llm/model.litertlm (the path OnDeviceLLMEvalTests.swift
# also defaults to), so running this script with no arguments is enough to
# make the eval tests runnable locally.
set -euo pipefail

MODEL_URL="https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/model.litertlm"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(dirname "$SCRIPT_DIR")"
DEST="${1:-${ON_DEVICE_LLM_MODEL_PATH:-$IOS_DIR/.cache/on-device-llm/model.litertlm}}"

if [[ -f "$DEST" && -s "$DEST" ]]; then
    echo "Model already present at $DEST ($(du -h "$DEST" | cut -f1)), skipping download."
    exit 0
fi

mkdir -p "$(dirname "$DEST")"

echo "Downloading model.litertlm (~2.6 GB) to $DEST ..."
curl -fL --retry 3 --retry-delay 5 -o "$DEST.partial" "$MODEL_URL"
mv "$DEST.partial" "$DEST"

echo "Done: $DEST ($(du -h "$DEST" | cut -f1))"
