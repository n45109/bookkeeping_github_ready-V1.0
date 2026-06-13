# Bookkeeping 1.0

A lightweight bookkeeping system for three role types:

- `开发人员`：system administration and audit only
- `Boss`：organization-level management and reporting
- `项目主管`：daily bookkeeping within own scope

This repository is the 1.0 release-ready project copy for local testing, GitHub sync, and Tencent Cloud deployment.

## Core capabilities

- natural-language bookkeeping input
- role-based record visibility
- Boss report views and filtering
- project leader self-scope bookkeeping
- developer/admin account management and audit support
- Excel export
- database migration and release verification helpers

## Project structure

- `main.py`: FastAPI backend entry
- `database.py`: SQLite schema, migration, and business persistence logic
- `static/`: frontend page assets
- `data/`: project memory files, verification scripts, and runtime data directory
- `start.bat`: Windows local startup helper
- `start.sh`: Linux/Tencent Cloud startup helper
- `deploy_update.sh`: server-side update script
- `rollback_data.sh`: data rollback helper
- `DEPLOY.md`: deployment and update notes

## Local development

Windows local startup:

```bash
start.bat
```

What it does:

1. finds a usable Python runtime
2. creates `venv` if needed
3. installs requirements
4. checks local port usage
5. starts the backend
6. waits for `/api/health`

## Production deployment

Recommended production mode:

- Linux / Tencent Cloud
- `systemd` + `bookkeeping.service`
- `start.sh` for backend startup
- persistent `data/` directory

Default production port in this release copy:

- `8091`

See full deployment notes here:

- `DEPLOY.md`

## Release and update flow

Recommended release flow:

1. test locally
2. sync to GitHub
3. deploy from GitHub to Tencent Cloud
4. keep server `data/` persistent during upgrades
5. run release verification after update

Release verification entry:

```bash
python data/verify_release_gate.py
```

This verifies:

- startup health
- organization isolation
- schema readiness
- post-upgrade read/write checks
- running balance behavior
- export backend readiness

## Database safety

The backend includes migration safety for iterative releases:

- core-table readiness checks
- migration path for older schemas
- required-column validation
- migration backup support
- release-gate verification scripts

Important rule:

- do not commit runtime database files, logs, or SQLite lock files to GitHub

## Files that should not be uploaded as runtime artifacts

Examples of local runtime leftovers that should stay out of git:

- `data/bookkeeping.db`
- `data/*.db-wal`
- `data/*.db-shm`
- `data/app.log`
- `data/error.log`
- `data/backups/`
- `__pycache__/`

## Notes

- This project copy is intended to be clean before GitHub sync.
- First-install boot and old-database upgrade boot were both verified during the 1.0 release cleanup work.
- If you change schema or role logic in later versions such as 1.1+, repeat both checks:
  - fresh empty-data startup check
  - old-database upgrade startup check
