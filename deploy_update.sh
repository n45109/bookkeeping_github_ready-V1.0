#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$BASE_DIR/data"
VENV_PYTHON="$BASE_DIR/venv/bin/python"
SERVICE_NAME="${BOOKKEEPING_SERVICE_NAME:-bookkeeping}"
BACKUP_ROOT="${BOOKKEEPING_BACKUP_ROOT:-$BASE_DIR/../bookkeeping_backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/data_$TIMESTAMP"

echo_step() {
  printf '[%s] %s\n' "$1" "$2"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_command git
require_command systemctl
require_command rsync

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "missing python runtime: $VENV_PYTHON" >&2
  echo "create the production virtualenv and install requirements first" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

echo_step "1/6" "Backing up live data directory"
if [[ -d "$DATA_DIR" ]]; then
  mkdir -p "$BACKUP_DIR"
  rsync -a --delete "$DATA_DIR/" "$BACKUP_DIR/"
else
  echo "warning: data directory does not exist yet, backup skipped" >&2
fi

echo_step "2/6" "Pulling latest code from GitHub"
git -C "$BASE_DIR" pull --ff-only

echo_step "3/6" "Restarting service"
sudo systemctl restart "$SERVICE_NAME"

echo_step "4/6" "Checking service status"
sudo systemctl --no-pager --full status "$SERVICE_NAME"

echo_step "5/6" "Running post-upgrade verification"
"$VENV_PYTHON" "$BASE_DIR/data/verify_org_isolation.py"
"$VENV_PYTHON" "$BASE_DIR/data/verify_post_upgrade_checks.py"

echo_step "6/6" "Done"
echo "Backup saved at: $BACKUP_DIR"
echo "Next: do a short manual acceptance check in browser before treating this deployment as accepted."
