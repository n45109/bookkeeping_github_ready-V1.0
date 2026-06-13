# Bookkeeping Project Architecture

Last updated: 2026-06-07

This file is the internal architecture reference for this project.
Its purpose is to preserve stable understanding after future iterations,
context resets, or troubleshooting sessions.

## 1. Project position

This is a Chinese bookkeeping system built with:

- Backend: FastAPI
- Database: SQLite
- AI classification: DeepSeek via OpenAI-compatible SDK
- Frontend: static single-page UI

Current priority is not adding many business pages.
Current priority is stabilizing:

- startup
- organization isolation
- boss/staff permission rules
- future database evolution

## 2. Key files

### Backend

- `main.py`
  - FastAPI entry
  - auth APIs
  - bookkeeping APIs
  - admin APIs
  - health API: `/api/health`

- `database.py`
  - SQLite connection
  - schema init and migration
  - users, organizations, sessions, settings, records
  - permission scope logic
  - centralized write retry for short SQLite lock conflicts
  - migration safety checks and pre-migration backup

### Frontend

- `static/index.html`
- `static/app.js`

Frontend keeps one shared UI.
Data visibility is controlled by backend scope, not by separate pages.

There is now also an organization structure panel in the shared UI:

- bosses/admins can manage staff there
- staff can only view members there
- organization name can be edited and saved by boss/admin
- default organization name is `神秘组织`
- organization display name is only for user-facing presentation
- default state shows plain text name plus `修改`, not an always-open input
- current intended visual layout is the compact two-card version, not the wide `settings-grid` variant

### Startup

- `start.bat`
  - Windows local development entry
  - must call `launcher.py`

- `launcher.py`
  - development launcher
  - create venv if missing
  - install requirements
  - validate dependencies
  - check port
  - start service
  - wait for health check

- `start.sh`
  - Linux/Tencent Cloud production entry
  - start uvicorn only

- `bookkeeping.service`
  - systemd unit template

- `DEPLOY.md`
  - deployment notes

### Data and logs

- `data/bookkeeping.db`
- `data/app.log`
- `data/error.log`
- `data/PROJECT_ARCHITECTURE.md`
- `data/PROJECT_GUARDRAILS.md`
- `data/AGENT_RULES.md`
- `data/verify_org_isolation.py`
- `data/verify_post_upgrade_checks.py`

## 3. Dual-startup design

This project intentionally has two startup modes.
They are not duplicates.

### Development startup

Files:

- `start.bat`
- `launcher.py`

Purpose:

- local development
- cold-start troubleshooting
- local environment self-repair

Behavior:

- resolve Python
- create `venv`
- install requirements
- validate dependencies
- check port 8080
- wait for `/api/health`
- open browser on Windows

### Production startup

Files:

- `start.sh`
- `bookkeeping.service`

Purpose:

- Tencent Cloud Linux server
- long-running service

Behavior:

- do not install dependencies on every boot
- do not open browser
- assume venv already exists
- rely on systemd for restart and boot-time start
- keep `data/` persistent and backed up before GitHub-driven updates

## 4. Important startup rule

Do not casually delete or merge these files:

- `start.bat`
- `launcher.py`
- `start.sh`
- `bookkeeping.service`

Reason:

- development startup and production startup have different responsibilities
- development startup may self-repair
- production startup must stay lightweight and predictable

## 5. Core data model

### `organizations`

Represents one boss team / one organization.

Key fields:

- `id`
- `name`
- `owner_user_id`

Field semantics:

- `organizations.id` is the internal identity used for permission and data isolation
- `organizations.name` is only the user-facing display name shown in the UI
- display name may change without changing organization identity
- permission logic must never depend on display name text

### `users`

Represents system users.

Key fields:

- `id`
- `username`
- `password_hash`
- `display_name`
- `is_admin`
- `organization_id`
- `role`

Current roles:

- `admin`
- `boss`
- `staff`

Notes:

- `is_admin` is a legacy compatibility field and is still kept
- `role` is the main role field for future logic

### `records`

Represents bookkeeping records.

Key fields:

- `id`
- `user_id`
- `owner_user_id`
- `organization_id`
- `created_by_user_id`
- bookkeeping business fields

## 6. Record field semantics

This section is critical.

### `organization_id`

The organization that owns the record.

This is the first-level permission filter.

### `owner_user_id`

The user who owns the record.

This is the main field for staff visibility:

- staff usually see only records where `owner_user_id = current user id`
- boss can see all records in the same organization

### `created_by_user_id`

The user who created or entered the record.

This exists to keep a future extension point for:

- boss enters a record for staff
- finance enters a record for someone else
- delegated bookkeeping

Owner and creator may be different users.

### `user_id`

Legacy compatibility field.
Keep it for now.
Do not remove it during the current stage.

Current rule:

- new visibility logic uses `owner_user_id`
- `user_id` remains for compatibility and future customization

## 7. Permission model

All record read/update/delete operations must follow this order:

1. identify current user
2. identify current user's `organization_id`
3. filter by `organization_id`
4. then apply role-based visibility

### Boss/admin rule

If user is:

- `is_admin = 1`
- or `role in {admin, boss}`

then user can see and manage all records in the same organization.

Scope:

- `organization_id = current_user.organization_id`

### Staff rule

If user role is `staff`,
then user can only see owned records in the same organization.

Scope:

- `organization_id = current_user.organization_id`
- `owner_user_id = current_user.id`

## 8. Official architecture decision

This system is NOT designed as one table per employee.

Official design is:

- one shared `records` table
- every record has organization tag
- every record has owner tag
- backend applies role-based filtering

This is the current official architecture.

## 9. Scope logic location

Permission scope is centralized in `database.py`.

Important functions:

- `can_manage_organization_records(user)`
- `build_record_scope(user)`

If future boss rules change, prefer changing scope logic there first.
Do not scatter permission edits across many endpoints unless necessary.

## 10. Current backend functions already using new scope

These record-related functions should follow organization + role scope:

- `load_records`
- `get_all_records`
- `get_balance`
- `get_balance_history`
- `has_records`
- `delete_records`
- `export_to_excel`

## 11. Isolation verification

There is now a repeatable validation script:

- `data/verify_org_isolation.py`

Its job is to verify:

- boss in organization A sees all A records only
- staff in organization A sees own A records only
- boss in organization B sees all B records only
- staff in organization B sees own B records only
- cross-organization leakage does not happen

This script is part of the project memory and should be rerun after permission changes.

Current safety rule:

- `verify_org_isolation.py` should validate against a temporary copied database by default
- validation must not silently pollute the primary working database

There is now also a broader deployment regression script:

- `data/verify_post_upgrade_checks.py`

Its job is to verify:

- core schema is complete after startup/migration
- basic read/write still works after upgrade
- organization isolation still works
- initial balance `0` still counts as initialized
- running balance still follows `date` then `id`
- Excel export still works on the backend

Current safety rule:

- this broader script should also validate against a temporary copied database
- it is meant for post-deploy regression, not browser UX testing

## 12. Admin user creation rule

Current intended rule:

- boss/admin only manages users inside own organization
- newly created users are attached to creator's organization by default
- organization structure panel uses this rule directly

Current panel behavior:

- boss/admin can add staff
- boss/admin can delete staff without bookkeeping records
- boss/admin can rename organization
- staff can view members only
- staff cannot create or delete members
- staff cannot rename organization

This means future "boss creates staff" UI does not need a new database direction.
It mainly needs frontend entry and workflow.

## 13. Extension points intentionally kept

The project must remain adaptable because different bosses may request different rules later.

Current intentional extension points:

- keep `records.user_id`
- separate `owner_user_id`
- separate `created_by_user_id`
- centralize scope logic near `build_record_scope`

This is intentional and should not be simplified away casually.

## 14. Things not recommended right now

Do not do these during the current stage:

- do not create one database table per employee
- do not turn production startup into development startup
- do not delete compatibility fields too early

Especially do not casually remove:

- `records.user_id`
- `users.is_admin`

## 15. Recovery checklist after context loss

If context is lost, re-read these first:

- `data/PROJECT_ARCHITECTURE.md`
- `data/PROJECT_GUARDRAILS.md`
- `data/AGENT_RULES.md`
- `data/verify_org_isolation.py`
- `data/verify_post_upgrade_checks.py`
- `database.py`
- `main.py`
- `launcher.py`
- `start.sh`

Most important conclusions to restore:

1. one shared `records` table, not one table per employee
2. permissions check organization first, then role
3. staff visibility is mainly controlled by `owner_user_id`
4. startup is dual-mode: development and production
5. organization display name is persisted in backend, but organization identity still depends on `organization_id`

## 17. Current balance rule

This rule matters for trust in bookkeeping reports.

Current intended rule:

- total balance = initial balance + total income - total expense
- running balance history is ordered by:
  - `date` ascending first
  - then `id` ascending for same-day stability

Interpretation:

- if a historical record is added later with an older business date,
  it should be inserted back into the correct date position in the running balance timeline
- same-day records still use `id` as the tie-breaker

Warning:

- preview balance for a new unsaved batch is still calculated in the current preview order
- that preview is only for the current pending batch, not the final full-history timeline

This balance rule should now be treated as a formal regression item:

- rerun `data/verify_post_upgrade_checks.py` after changes that touch:
  - database ordering
  - report local balance recomputation
  - export balance generation

## 16. Current stability conclusions

- SQLite short write-lock conflicts are now handled by centralized retry logic in `database.py`
- backend now checks required tables, critical columns, and schema version before treating database state as ready
- backend now creates a database backup before upgrading an older populated schema
- Backend and database can store Chinese organization names correctly through normal UTF-8 JSON requests
- PowerShell console garbling is not enough to conclude database text corruption
- If organization UI text unexpectedly reappears, inspect both `static/index.html` and `static/app.js`
- If organization layout regresses to the wide flat version, inspect `renderOrgStructure()` first; that function directly defines the org page DOM structure

