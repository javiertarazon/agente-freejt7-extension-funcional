#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-node}"

if [[ -n "${FREEJT7_APP_ROOT:-}" ]]; then
  APP_ROOT="$FREEJT7_APP_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RELATIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [[ -f "$RELATIVE_ROOT/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="$RELATIVE_ROOT"
  elif [[ -f "/opt/freejt7-desktop/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="/opt/freejt7-desktop"
  else
    echo "[freejt7-desktop] ERROR: no se pudo resolver APP_ROOT." >&2
    exit 1
  fi
fi

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "[freejt7-desktop] ERROR: no se encontro node en PATH." >&2
  exit 1
fi

WORKSPACE="${FREEJT7_WORKSPACE:-$PWD}"

exec "$NODE_BIN" "$APP_ROOT/scripts/freejt7-own-ide-bootstrap.js" \
  --repo-root="$APP_ROOT" \
  --workspace="$WORKSPACE" \
  "$@"
