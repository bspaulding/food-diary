#!/bin/bash
# Install git pre-push hook

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/pre-push"
HOOK_DEST="$SCRIPT_DIR/.git/hooks/pre-push"

echo "Installing pre-push hook..."

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Error: pre-push script not found at $HOOK_SOURCE"
  exit 1
fi

cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-push hook installed successfully"
