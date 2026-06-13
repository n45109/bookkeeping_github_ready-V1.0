#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$BASE_DIR/venv"
PYTHON_BIN="$VENV_DIR/bin/python"
HOST="${APP_HOST:-0.0.0.0}"
PORT="${APP_PORT:-8091}"

cd "$BASE_DIR"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "[ERROR] Missing $PYTHON_BIN"
  echo "Create the production virtualenv and install requirements before starting."
  exit 1
fi

exec "$PYTHON_BIN" -m uvicorn main:app --host "$HOST" --port "$PORT"

