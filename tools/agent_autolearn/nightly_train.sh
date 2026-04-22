#!/usr/bin/env bash
# nightly_train.sh — wrapper para lanzar auto_trainer.py desde cron o systemd
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$ROOT/.agent-learning/logs"
LOG_FILE="$LOG_DIR/nightly_train.log"

mkdir -p "$LOG_DIR"
echo "--- nightly_train.sh $(date -Iseconds) ---" >> "$LOG_FILE"

cd "$ROOT"
python3 tools/agent_autolearn/auto_trainer.py \
  --config tools/agent_autolearn/config.json \
  >> "$LOG_FILE" 2>&1
