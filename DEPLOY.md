# Bookkeeping deployment notes

## Modes

- Development on Windows: `start.bat`
- Production on Linux/Tencent Cloud: `start.sh` + `bookkeeping.service`

## Development startup

`start.bat` calls `launcher.py` and does the following:

1. Resolve a usable Python runtime
2. Create `venv` if missing
3. Install and validate `requirements.txt`
4. Check port `8080`
5. Start the FastAPI service
6. Wait for `/api/health` to return `200`

Use this mode for local development only.

## Production startup

Production should not reinstall dependencies on every boot.

Recommended steps:

1. Upload project to Linux server, for example `/opt/bookkeeping`
2. Create virtualenv once:
   - `python3 -m venv /opt/bookkeeping/venv`
3. Install dependencies once:
   - `/opt/bookkeeping/venv/bin/pip install -r /opt/bookkeeping/requirements.txt`
4. Before replacing code, back up the current database directory:
   - `cp -r /opt/bookkeeping/data /opt/bookkeeping/data_backup_$(date +%Y%m%d_%H%M%S)`
5. Replace code from GitHub update while keeping the live `data/` directory
6. Start service:
   - `/opt/bookkeeping/start.sh`

`start.sh` only starts uvicorn and assumes dependencies are already installed.

For repeatable Tencent Cloud updates, prefer:

- `/opt/bookkeeping/deploy_update.sh`

This script does:

1. backup live `data/`
2. `git pull --ff-only`
3. restart `bookkeeping.service`
4. print service status
5. run post-upgrade verification scripts

Release gate entry:

- `/opt/bookkeeping/venv/bin/python /opt/bookkeeping/data/verify_release_gate.py`

Rollback helper:

- `bash /opt/bookkeeping/rollback_data.sh /path/to/backup_dir`

## Database safety during updates

Current rule for production updates:

1. keep `data/` persistent
2. create a full filesystem backup of `data/` before update
3. let backend migration run on first startup of the new version
4. if startup fails, inspect:
   - `data/error.log`
   - `data/app.log`
   - service logs from `systemd`
5. if migration-related startup fails, restore the previous `data/` backup before retrying

There is now also an in-app safety layer:

- backend checks core tables before treating the database as ready
- backend creates a migration backup before upgrading an older schema
- backend validates critical columns after migration

This does not replace server-side backup. It is a second line of protection.

## GitHub to server update flow

This is the intended real-world flow for this project:

1. modify and test locally on Windows
2. commit and push to GitHub so there is rollback history
3. on Tencent Cloud, run:
   - `cd /opt/bookkeeping`
   - `bash ./deploy_update.sh`
4. after script success, run a short manual business check
5. only then treat the deployment as accepted

## Automatic post-upgrade verification

Run these scripts after a GitHub-driven update:

1. unified release gate:
   - `python data/verify_release_gate.py`
2. if you need to run pieces separately:
   - `python data/verify_startup_health.py`
   - `python data/verify_org_isolation.py`
   - `python data/verify_post_upgrade_checks.py`

`verify_post_upgrade_checks.py` uses a temporary copied database and checks:

- core tables and required columns exist
- schema is ready and does not still need migration
- a basic read/write round trip works
- organization isolation still works
- initial balance value `0` is treated as already initialized
- running balance history follows `date` first, then `id`
- Excel export works on the backend and produces a readable `.xlsx`

If either script fails:

1. stop and inspect:
   - `data/app.log`
   - `data/error.log`
   - `systemd` service logs
2. do not continue normal use yet
3. if the failure is migration-related, restore the server backup of `data/`
4. retry only after the failing check is understood

If `deploy_update.sh` or `verify_release_gate.py` fails after backup but before acceptance:

1. restore the backed-up `data/` directory
   - `bash ./rollback_data.sh /path/to/backup_dir`
2. restart the previous known-good code version
3. inspect the failure before trying again

## Manual acceptance check

Automatic verification is not enough by itself.

After scripts pass, manually confirm:

1. boss can log in and view records normally
2. staff can log in and only see own records
3. one simple record can be previewed and saved
4. report page still behaves correctly for normal filtering/editing
5. Excel export works in a normal external browser

Important boundary:

- automatic verification proves backend export generation
- manual verification proves browser download experience

Do not treat those as the same problem.

## systemd

Copy `bookkeeping.service` to:

- `/etc/systemd/system/bookkeeping.service`

Then run:

- `sudo systemctl daemon-reload`
- `sudo systemctl enable bookkeeping`
- `sudo systemctl start bookkeeping`
- `sudo systemctl status bookkeeping`

## Reverse proxy

Recommended production topology:

- `nginx` public entry
- `uvicorn` bound on `127.0.0.1` or internal port
- systemd manages restart

## Notes

- Keep `data/` persistent across deployments
- Back up `data/` before every GitHub-driven server update
- Do not run `start.bat` on Tencent Cloud Linux
- Treat `launcher.py` as a development launcher, not a production launcher
- Keep these project memory files in sync after major changes:
  - `data/PROJECT_ARCHITECTURE.md`
  - `data/PROJECT_GUARDRAILS.md`
  - `data/AGENT_RULES.md`
