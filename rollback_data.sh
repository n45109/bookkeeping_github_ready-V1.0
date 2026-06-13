#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$BASE_DIR/data"
SERVICE_NAME="${BOOKKEEPING_SERVICE_NAME:-bookkeeping}"
BACKUP_SOURCE="${1:-}"

if [[ -z "$BACKUP_SOURCE" ]]; then
  echo "usage: bash ./rollback_data.sh /path/to/backup_dir" >&2
  exit 1
fi

if [[ ! -d "$BACKUP_SOURCE" ]]; then
  echo "backup directory not found: $BACKUP_SOURCE" >&2
  exit 1
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "live data directory not found: $DATA_DIR" >&2
  exit 1
fi

echo "[1/3] stopping service"
sudo systemctl stop "$SERVICE_NAME"

echo "[2/3] restoring backup into live data directory"
rsync -a --delete "$BACKUP_SOURCE/" "$DATA_DIR/"

echo "[3/3] starting service"
sudo systemctl start "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"

echo "rollback complete"
