#!/usr/bin/env bash
# Downloads a model + mmproj GGUF pair listed in ../models.toml into models/<key>/.
# Usage: ./scripts/fetch-model.sh <key> [models-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$CRATE_DIR/models.toml"

KEY="${1:?Usage: fetch-model.sh <key> [models-dir]}"
MODELS_DIR="${2:-$CRATE_DIR/models}"

read -r HF_REPO MODEL_FILE MMPROJ_FILE < <(python3 - "$MANIFEST" "$KEY" <<'PYEOF'
import sys, tomllib
manifest_path, key = sys.argv[1], sys.argv[2]
with open(manifest_path, "rb") as f:
    data = tomllib.load(f)
entry = data.get("models", {}).get(key)
if entry is None:
    sys.exit(f"No [models.{key}] entry in {manifest_path}")
print(entry["hf_repo"], entry["model_file"], entry["mmproj_file"])
PYEOF
)

DEST="$MODELS_DIR/$KEY"
mkdir -p "$DEST"

for FILE in "$MODEL_FILE" "$MMPROJ_FILE"; do
    OUT="$DEST/$FILE"
    if [ -f "$OUT" ]; then
        echo "already have $OUT, skipping"
        continue
    fi
    URL="https://huggingface.co/$HF_REPO/resolve/main/$FILE"
    echo "downloading $URL -> $OUT"
    curl -sSL -o "$OUT" "$URL"
done

echo "$KEY ready:"
echo "  model:  $DEST/$MODEL_FILE"
echo "  mmproj: $DEST/$MMPROJ_FILE"
